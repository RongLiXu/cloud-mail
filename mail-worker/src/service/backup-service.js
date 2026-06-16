import orm from '../entity/orm';
import setting from '../entity/setting';
import settingService from './setting-service';
import BizError from '../error/biz-error';

const backupService = {

	async getConfig(c) {
		const settingRow = await settingService.query(c);
		return {
			backupDbType: settingRow.backupDbType,
			backupDbHost: settingRow.backupDbHost,
			backupDbPort: settingRow.backupDbPort,
			backupDbUser: settingRow.backupDbUser,
			backupDbPassword: settingRow.backupDbPassword ? `${settingRow.backupDbPassword.slice(0, 2)}****${settingRow.backupDbPassword.slice(-2)}` : '',
			backupDbName: settingRow.backupDbName,
			backupSchedule: settingRow.backupSchedule,
			backupCron: settingRow.backupCron,
			backupDirection: settingRow.backupDirection,
			backupD1Binding: settingRow.backupD1Binding,
		};
	},

	async saveConfig(c, params) {
		const allowed = [
			'backupDbType', 'backupDbHost', 'backupDbPort', 'backupDbUser',
			'backupDbPassword', 'backupDbName', 'backupSchedule', 'backupCron',
			'backupDirection', 'backupD1Binding'
		];
		const update = {};
		for (const key of allowed) {
			if (params[key] !== undefined) {
				update[key] = params[key];
			}
		}
		await orm(c).update(setting).set(update).run();
		await settingService.refresh(c);
		return this.getConfig(c);
	},

	async getTableList(c) {
		const db = c.env.db;
		const { results } = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf%' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' ORDER BY name").all();
		return results.map(r => r.name);
	},

	async getTableInfo(c, tableName) {
		const db = c.env.db;
		const { results } = await db.prepare(`PRAGMA table_info('${tableName}')`).all();
		return results;
	},

	async exportSql(c) {
		const tableNames = await this.getTableList(c);
		const db = c.env.db;
		const lines = [];
		lines.push('-- Cloud-Mail Database Backup');
		lines.push(`-- Generated: ${new Date().toISOString()}`);
		lines.push('');

		for (const tableName of tableNames) {
			const columns = await this.getTableInfo(c, tableName);
			if (columns.length === 0) continue;

			lines.push(`-- Table: ${tableName}`);
			lines.push(`DROP TABLE IF EXISTS \`${tableName}\`;`);

			const colDefs = columns.map(col => {
				let def = `\`${col.name}\` ${col.type}`;
				if (col.pk) def += ' PRIMARY KEY';
				if (col.pk && col.type.toUpperCase() === 'INTEGER') def += ' AUTOINCREMENT';
				if (col.notnull) def += ' NOT NULL';
				if (col.dflt_value !== null) def += ` DEFAULT ${col.dflt_value}`;
				return def;
			});
			lines.push(`CREATE TABLE IF NOT EXISTS \`${tableName}\` (\n  ${colDefs.join(',\n  ')}\n);`);
			lines.push('');

			const { results: rows } = await db.prepare(`SELECT * FROM \`${tableName}\``).all();
			if (rows.length === 0) {
				lines.push('');
				continue;
			}

			const colNames = columns.map(c => `\`${c.name}\``).join(', ');
			const batchSize = 200;
			for (let i = 0; i < rows.length; i += batchSize) {
				const batch = rows.slice(i, i + batchSize);
				const valuesList = batch.map(row => {
					const vals = columns.map(col => {
						const val = row[col.name];
						if (val === null || val === undefined) return 'NULL';
						if (typeof val === 'number') return String(val);
						const escaped = String(val).replace(/'/g, "''");
						return `'${escaped}'`;
					});
					return `(${vals.join(', ')})`;
				}).join(',\n');
				lines.push(`INSERT OR IGNORE INTO \`${tableName}\` (${colNames}) VALUES\n${valuesList};`);
			}
			lines.push('');
		}

		return lines.join('\n');
	},

	async getFullConfig(c) {
		const settingRow = await settingService.query(c);
		return {
			dbType: settingRow.backupDbType,
			host: settingRow.backupDbHost,
			port: settingRow.backupDbPort,
			user: settingRow.backupDbUser,
			password: settingRow.backupDbPassword,
			database: settingRow.backupDbName,
			d1Binding: settingRow.backupD1Binding,
		};
	},

	createTableSql(tableName, columns, dialect) {
		const colDefs = columns.map(col => {
			let type = col.type.toUpperCase();

			if (dialect === 'mysql') {
				if (type === 'INTEGER') type = 'INT';
				if (col.pk && type === 'INT') type = 'INT AUTO_INCREMENT';
			} else if (dialect === 'pgsql') {
				if (type === 'INTEGER') type = 'INTEGER';
				if (col.pk && type === 'INTEGER') type = 'SERIAL';
			} else if (dialect === 'mssql') {
				if (type === 'INTEGER') type = 'INT';
				if (col.pk && type === 'INT') type = 'INT IDENTITY(1,1)';
			}

			let def = `"${col.name}" ${type}`;
			if (col.pk && dialect !== 'mysql' && dialect !== 'mssql') def += ' PRIMARY KEY';
			if (col.pk && dialect === 'mysql') def += ' PRIMARY KEY';
			if (col.pk && dialect === 'mssql') def += ' PRIMARY KEY';
			if (col.notnull && !col.pk) def += ' NOT NULL';
			if (col.dflt_value !== null && !col.pk) {
				def += ` DEFAULT ${col.dflt_value}`;
			}
			return def;
		});

		return `CREATE TABLE IF NOT EXISTS "${tableName}" (\n  ${colDefs.join(',\n  ')}\n);`;
	},

	async pushToExternal(c) {
		const config = await this.getFullConfig(c);
		if (!config.dbType || !config.host) {
			throw new BizError('请先保存外部数据库配置 Please configure the external database first.');
		}

		const tableNames = await this.getTableList(c);
		const db = c.env.db;

		let totalRows = 0;
		const dialect = config.dbType;

		if (config.dbType === 'd1') {
			const targetDb = c.env[config.d1Binding];
			if (!targetDb) {
				throw new BizError(`D1 binding '${config.d1Binding}' not found. Please add it in wrangler.toml.`);
			}

			for (const tableName of tableNames) {
				const columns = await this.getTableInfo(c, tableName);
				if (columns.length === 0) continue;

				const createSql = this.createTableSql(tableName, columns, 'sqlite');
				await targetDb.exec(createSql);

				const { results: rows } = await db.prepare(`SELECT * FROM \`${tableName}\``).all();
				if (rows.length === 0) continue;

				const colNames = columns.map(c => `"${c.name}"`).join(', ');
				const placeholders = columns.map(() => '?').join(', ');
				const insertStmt = `INSERT OR IGNORE INTO "${tableName}" (${colNames}) VALUES (${placeholders})`;

				const batchSize = 100;
				const stmts = [];
				for (let i = 0; i < rows.length; i += batchSize) {
					const batch = rows.slice(i, i + batchSize);
					const values = batch.map(row => columns.map(col => row[col.name]));
					stmts.push(targetDb.prepare(insertStmt).bind(...values.flat()));
				}
				await targetDb.batch(stmts);
				totalRows += rows.length;
			}
		} else {
			const sql = await this.exportSql(c);
			const convertedSql = this.convertDialect(sql, config.dbType);
			if (config.dbType === 'mysql' || config.dbType === 'pgsql' || config.dbType === 'mssql') {
				return await this.executeRemoteSql(config, convertedSql);
			} else {
				throw new BizError(`不支持的数据库类型 Unsupported database type: ${config.dbType}`);
			}
		}

		return { totalRows, tableCount: tableNames.length };
	},

	async pullFromExternal(c) {
		const config = await this.getFullConfig(c);
		if (!config.dbType || !config.host) {
			throw new BizError('请先保存外部数据库配置 Please configure the external database first.');
		}

		if (config.dbType === 'd1') {
			const sourceDb = c.env[config.d1Binding];
			if (!sourceDb) {
				throw new BizError(`D1 binding '${config.d1Binding}' not found. Please add it in wrangler.toml.`);
			}

			const tableNames = await this.getTableList(c);
			const targetDb = c.env.db;
			let totalRows = 0;

			for (const tableName of tableNames) {
				const columns = await this.getTableInfo(c, tableName);
				if (columns.length === 0) continue;

				const { results: rows } = await sourceDb.prepare(`SELECT * FROM \`${tableName}\``).all();
				if (!rows || rows.length === 0) continue;

				const colNames = columns.map(c => `\`${c.name}\``).join(', ');
				const placeholders = columns.map(() => '?').join(', ');
				const insertStmt = `INSERT OR IGNORE INTO \`${tableName}\` (${colNames}) VALUES (${placeholders})`;

				const batchSize = 100;
				const stmts = [];
				for (let i = 0; i < rows.length; i += batchSize) {
					const batch = rows.slice(i, i + batchSize);
					const values = batch.map(row => columns.map(col => row[col.name]));
					stmts.push(targetDb.prepare(insertStmt).bind(...values.flat()));
				}
				await targetDb.batch(stmts);
				totalRows += rows.length;
			}

			return { totalRows, tableCount: tableNames.length };
		}

		const sql = await this.exportSql(c);
		return await this.executeRemoteSql(config, sql);
	},

	convertDialect(sql, dialect) {
		if (dialect === 'sqlite' || dialect === 'd1') return sql;

		let result = sql;
		if (dialect === 'mysql') {
			result = result.replace(/AUTOINCREMENT/gi, 'AUTO_INCREMENT');
			result = result.replace(/INTEGER PRIMARY KEY AUTO_INCREMENT/gi, 'INT AUTO_INCREMENT PRIMARY KEY');
			result = result.replace(/INSERT OR IGNORE INTO/gi, 'INSERT IGNORE INTO');
			result = result.replace(/`/g, '`');
		} else if (dialect === 'pgsql') {
			result = result.replace(/AUTOINCREMENT/gi, '');
			result = result.replace(/INTEGER PRIMARY KEY(?! AUTO)/gi, 'SERIAL PRIMARY KEY');
			result = result.replace(/INSERT OR IGNORE INTO/gi, 'INSERT INTO');
			result = result.replace(/`/g, '"');
			result = result.replace(/'/g, "''");
			result = result.replace(/INSERT INTO ([^(]+) \((.+?)\) VALUES/gi, (match, table, cols) => {
				return `INSERT INTO ${table} (${cols}) VALUES`;
			}) + '\nON CONFLICT DO NOTHING;';
		} else if (dialect === 'mssql') {
			result = result.replace(/AUTOINCREMENT/gi, 'IDENTITY(1,1)');
			result = result.replace(/INTEGER PRIMARY KEY/gi, 'INT IDENTITY(1,1) PRIMARY KEY');
			result = result.replace(/INSERT OR IGNORE INTO/gi, 'IF NOT EXISTS (SELECT 1 FROM');
			result = result.replace(/`/g, '"');
			result = result.replace(/TEXT/gi, 'NVARCHAR(MAX)');
		}

		return result;
	},

	async executeRemoteSql(config, sql) {
		if (config.dbType === 'mysql') {
			return await this.executeMysql(config, sql);
		} else if (config.dbType === 'pgsql') {
			return await this.executePgsql(config, sql);
		} else if (config.dbType === 'mssql') {
			throw new BizError('MSSQL 直连暂不支持，请导出 SQL 文件后手动导入。MSSQL direct connection is not yet supported. Please export SQL and import manually.');
		}
		throw new BizError(`不支持的数据库类型 Unsupported database type: ${config.dbType}`);
	},

	async executeMysql(config, sql) {
		try {
			const { Client } = await import('@planetscale/database');
			const client = new Client({
				host: config.host,
				username: config.user,
				password: config.password,
			});

			const statements = sql.split(';').filter(s => s.trim());
			for (const stmt of statements) {
				if (stmt.trim()) {
					await client.execute(stmt.trim() + ';');
				}
			}
			return { success: true, message: 'MySQL backup completed.' };
		} catch (e) {
			if (e.code === 'ERR_MODULE_NOT_FOUND' || e.message?.includes('Cannot find')) {
				throw new BizError('MySQL 驱动未安装，请运行 pnpm add @planetscale/database。MySQL driver not installed. Run: pnpm add @planetscale/database');
			}
			throw new BizError(`MySQL 连接失败: ${e.message}`);
		}
	},

	async executePgsql(config, sql) {
		try {
			const { Client } = await import('@neondatabase/serverless');
			const connectionString = `postgresql://${config.user}:${config.password}@${config.host}:${config.port || 5432}/${config.database || 'postgres'}`;
			const client = new Client(connectionString);
			await client.connect();

			const statements = sql.split(';').filter(s => s.trim());
			for (const stmt of statements) {
				if (stmt.trim()) {
					await client.query(stmt.trim() + ';');
				}
			}
			await client.end();
			return { success: true, message: 'PostgreSQL backup completed.' };
		} catch (e) {
			if (e.code === 'ERR_MODULE_NOT_FOUND' || e.message?.includes('Cannot find')) {
				throw new BizError('PostgreSQL 驱动未安装，请运行 pnpm add @neondatabase/serverless。PostgreSQL driver not installed. Run: pnpm add @neondatabase/serverless');
			}
			throw new BizError(`PostgreSQL 连接失败: ${e.message}`);
		}
	},

	async testConnection(c) {
		const config = await this.getFullConfig(c);
		if (!config.dbType || !config.host) {
			throw new BizError('请先填写数据库配置 Please fill in the database configuration first.');
		}

		if (config.dbType === 'd1') {
			const targetDb = c.env[config.d1Binding];
			if (!targetDb) {
				throw new BizError(`D1 binding '${config.d1Binding}' 未找到，请在 wrangler.toml 中添加绑定。`);
			}
			await targetDb.prepare('SELECT 1').run();
			return { success: true, message: 'D1 连接成功 D1 connection successful.' };
		}

		if (config.dbType === 'mysql') {
			try {
				const { Client } = await import('@planetscale/database');
				const client = new Client({
					host: config.host,
					username: config.user,
					password: config.password,
				});
				await client.execute('SELECT 1');
				return { success: true, message: 'MySQL 连接成功 MySQL connection successful.' };
			} catch (e) {
				return { success: false, message: `MySQL 连接失败: ${e.message}` };
			}
		}

		if (config.dbType === 'pgsql') {
			try {
				const { Client } = await import('@neondatabase/serverless');
				const connectionString = `postgresql://${config.user}:${config.password}@${config.host}:${config.port || 5432}/${config.database || 'postgres'}`;
				const client = new Client(connectionString);
				await client.connect();
				await client.query('SELECT 1');
				await client.end();
				return { success: true, message: 'PostgreSQL 连接成功 PostgreSQL connection successful.' };
			} catch (e) {
				return { success: false, message: `PostgreSQL 连接失败: ${e.message}` };
			}
		}

		if (config.dbType === 'mssql') {
			return { success: false, message: 'MSSQL 暂不支持直连测试，请导出 SQL 后手动导入。MSSQL test connection not yet supported.' };
		}

		return { success: false, message: `不支持的数据库类型: ${config.dbType}` };
	},

	async runBackupScheduled(env) {
		const settingRow = await env.kv.get('setting:', { type: 'json' });
		if (!settingRow) return;

		const schedule = settingRow.backupSchedule;
		if (schedule !== 1 && schedule !== 2) return;

		try {
			const tableNames = [];
			const { results } = await env.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf%' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' ORDER BY name").all();
			for (const r of results) tableNames.push(r.name);

			const sqlParts = [];
			for (const tableName of tableNames) {
				const cols = await env.db.prepare(`PRAGMA table_info('${tableName}')`).all();
				const columns = cols.results;
				if (columns.length === 0) continue;

				const colDefs = columns.map(col => {
					let def = `\`${col.name}\` ${col.type}`;
					if (col.pk) def += ' PRIMARY KEY';
					if (col.pk && col.type.toUpperCase() === 'INTEGER') def += ' AUTOINCREMENT';
					if (col.notnull) def += ' NOT NULL';
					if (col.dflt_value !== null) def += ` DEFAULT ${col.dflt_value}`;
					return def;
				});
				sqlParts.push(`CREATE TABLE IF NOT EXISTS \`${tableName}\` (\n  ${colDefs.join(',\n  ')}\n);`);

				const rows = await env.db.prepare(`SELECT * FROM \`${tableName}\``).all();
				if (rows.results.length === 0) continue;

				const colNames = columns.map(c => `\`${c.name}\``).join(', ');
				const batchSize = 200;
				for (let i = 0; i < rows.results.length; i += batchSize) {
					const batch = rows.results.slice(i, i + batchSize);
					const valuesList = batch.map(row => {
						const vals = columns.map(col => {
							const val = row[col.name];
							if (val === null || val === undefined) return 'NULL';
							if (typeof val === 'number') return String(val);
							const escaped = String(val).replace(/'/g, "''");
							return `'${escaped}'`;
						});
						return `(${vals.join(', ')})`;
					}).join(',\n');
					sqlParts.push(`INSERT OR IGNORE INTO \`${tableName}\` (${colNames}) VALUES\n${valuesList};`);
				}
			}

			const fullSql = sqlParts.join('\n');

			if (settingRow.backupDbType === 'd1') {
				const targetDb = env[settingRow.backupD1Binding];
				if (targetDb) {
					await targetDb.exec(fullSql);
					console.log(`[backup] Scheduled D1 backup completed at ${new Date().toISOString()}`);
				}
			}
		} catch (e) {
			console.error(`[backup] Scheduled backup failed: ${e.message}`);
		}
	},
};

export default backupService;
