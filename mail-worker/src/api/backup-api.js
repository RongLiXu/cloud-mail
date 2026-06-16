import app from '../hono/hono';
import result from '../model/result';
import backupService from '../service/backup-service';

app.get('/backup/config', async (c) => {
	const config = await backupService.getConfig(c);
	return c.json(result.ok(config));
});

app.put('/backup/config', async (c) => {
	const config = await backupService.saveConfig(c, await c.req.json());
	return c.json(result.ok(config));
});

app.get('/backup/export', async (c) => {
	const sql = await backupService.exportSql(c);
	c.header('Content-Type', 'application/sql; charset=utf-8');
	c.header('Content-Disposition', `attachment; filename="cloud-mail-backup-${new Date().toISOString().slice(0, 10)}.sql"`);
	return c.body(sql);
});

app.post('/backup/push', async (c) => {
	const res = await backupService.pushToExternal(c);
	return c.json(result.ok(res));
});

app.post('/backup/pull', async (c) => {
	const res = await backupService.pullFromExternal(c);
	return c.json(result.ok(res));
});

app.post('/backup/test-connection', async (c) => {
	const res = await backupService.testConnection(c);
	return c.json(result.ok(res));
});
