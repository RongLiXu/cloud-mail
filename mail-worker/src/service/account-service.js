import BizError from '../error/biz-error';
import verifyUtils from '../utils/verify-utils';
import emailUtils from '../utils/email-utils';
import userService from './user-service';
import emailService from './email-service';
import orm from '../entity/orm';
import account from '../entity/account';
import { and, asc, eq, gt, inArray, count, sql, ne, or, lt, desc } from 'drizzle-orm';
import { accountConst, isDel, settingConst } from '../const/entity-const';
import settingService from './setting-service';
import turnstileService from './turnstile-service';
import roleService from './role-service';
import { t } from '../i18n/i18n';
import verifyRecordService from './verify-record-service';

const accountService = {

	parseTags(tags) {
		if (Array.isArray(tags)) {
			return tags;
		}
		if (!tags) {
			return [];
		}
		return tags.split(',').map(item => item.trim()).filter(Boolean);
	},

	normalizeTags(tags = []) {
		if (!Array.isArray(tags)) {
			return [];
		}
		const tagMap = new Map();
		for (const item of tags) {
			const value = String(item ?? '').trim();
			if (!value) {
				continue;
			}
			if (value.includes(',')) {
				throw new BizError(t('accountTagComma'));
			}
			if (value.length > 20) {
				throw new BizError(t('accountTagLengthLimit'));
			}
			const key = value.toLowerCase();
			if (!tagMap.has(key)) {
				tagMap.set(key, value);
			}
			if (tagMap.size > 20) {
				throw new BizError(t('accountTagLimit'));
			}
		}
		return [...tagMap.values()];
	},

	serializeTags(tags = []) {
		return this.normalizeTags(tags).join(',');
	},

	formatAccountRow(row) {
		if (!row) {
			return row;
		}
		return {
			...row,
			tags: this.parseTags(row.tags)
		};
	},

	createTagCondition(tag) {
		return or(
			sql`${account.tags} COLLATE NOCASE = ${tag}`,
			sql`${account.tags} COLLATE NOCASE LIKE ${`${tag},%`}`,
			sql`${account.tags} COLLATE NOCASE LIKE ${`%,${tag}`}`,
			sql`${account.tags} COLLATE NOCASE LIKE ${`%,${tag},%`}`
		);
	},

	buildListConditions(userId, keyword, tag, status) {
		const conditions = [
			eq(account.userId, userId),
			eq(account.isDel, isDel.NORMAL),
		];

		if (typeof status === 'number') {
			conditions.push(eq(account.status, status));
		}

		if (keyword) {
			conditions.push(
				or(
					sql`${account.email} COLLATE NOCASE LIKE ${`%${keyword}%`}`,
					sql`${account.name} COLLATE NOCASE LIKE ${`%${keyword}%`}`
				)
			);
		}

		if (tag) {
			conditions.push(this.createTagCondition(tag));
		}

		return conditions;
	},

	async selectTagList(c, userId) {
		const rows = await orm(c).select({ tags: account.tags }).from(account).where(and(
			eq(account.userId, userId),
			eq(account.isDel, isDel.NORMAL),
			ne(account.tags, '')
		)).all();

		const tagCountMap = new Map();
		for (const row of rows) {
			for (const tag of this.parseTags(row.tags)) {
				tagCountMap.set(tag, (tagCountMap.get(tag) || 0) + 1);
			}
		}

		return [...tagCountMap.entries()]
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([name, count]) => ({ name, count }));
	},

	async add(c, params, userId) {

		const { addEmailVerify, addEmail, manyEmail, addVerifyCount, minEmailPrefix, emailPrefixFilter } = await settingService.query(c);

		let { email, token } = params;

		if (!(addEmail === settingConst.addEmail.OPEN && manyEmail === settingConst.manyEmail.OPEN)) {
			throw new BizError(t('addAccountDisabled'));
		}

		if (!email) {
			throw new BizError(t('emptyEmail'));
		}

		if (!verifyUtils.isEmail(email)) {
			throw new BizError(t('notEmail'));
		}

		if (!c.env.domain.includes(emailUtils.getDomain(email))) {
			throw new BizError(t('notExistDomain'));
		}

		if (emailUtils.getName(email).length < minEmailPrefix) {
			throw new BizError(t('minEmailPrefix', { msg: minEmailPrefix }));
		}

		if (emailPrefixFilter.some(content => emailUtils.getName(email).includes(content))) {
			throw new BizError(t('banEmailPrefix'));
		}

		let accountRow = await this.selectByEmailIncludeDel(c, email);

		if (accountRow && accountRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelAccount'));
		}

		if (accountRow) {
			throw new BizError(t('isRegAccount'));
		}

		const userRow = await userService.selectById(c, userId);
		const roleRow = await roleService.selectById(c, userRow.type);

		if (userRow.email !== c.env.admin) {

			if (roleRow.accountCount > 0) {
				const userAccountCount = await accountService.countUserAccount(c, userId);
				if (userAccountCount >= roleRow.accountCount) throw new BizError(t('accountLimit'), 403);
			}

			if (!roleService.hasAvailDomainPerm(roleRow.availDomain, email)) {
				throw new BizError(t('noDomainPermAdd'), 403);
			}

		}

		let addVerifyOpen = false;

		if (addEmailVerify === settingConst.addEmailVerify.OPEN) {
			addVerifyOpen = true;
			await turnstileService.verify(c, token);
		}

		if (addEmailVerify === settingConst.addEmailVerify.COUNT) {
			addVerifyOpen = await verifyRecordService.isOpenAddVerify(c, addVerifyCount);
			if (addVerifyOpen) {
				await turnstileService.verify(c, token);
			}
		}

		accountRow = await orm(c).insert(account).values({ email: email, userId: userId, name: emailUtils.getName(email) }).returning().get();

		if (addEmailVerify === settingConst.addEmailVerify.COUNT && !addVerifyOpen) {
			const row = await verifyRecordService.increaseAddCount(c);
			addVerifyOpen = row.count >= addVerifyCount;
		}

		accountRow.addVerifyOpen = addVerifyOpen;
		return this.formatAccountRow(accountRow);
	},

	selectByEmailIncludeDel(c, email) {
		return orm(c).select().from(account).where(sql`${account.email} COLLATE NOCASE = ${email}`).get();
	},

	async list(c, params, userId) {

		let { accountId, size, lastSort, keyword, num, tag } = params;

		accountId = Number(accountId);
		size = Number(size);
		lastSort = Number(lastSort);
		num = Number(num);
		keyword = keyword?.trim();
		tag = tag?.trim();

		if (size > 30) {
			size = 30;
		}

		if (num > 0) {
			const offset = (num - 1) * size;
			const normalConditions = this.buildListConditions(userId, keyword, tag, accountConst.status.NORMAL);
			const archivedConditions = this.buildListConditions(userId, keyword, tag, accountConst.status.ARCHIVED);

			const [normalList, normalTotalRow, archivedList, archivedTotalRow, tagList] = await Promise.all([
				orm(c).select().from(account).where(and(...normalConditions))
					.orderBy(desc(account.sort), asc(account.accountId))
					.limit(size)
					.offset(offset)
					.all(),
				orm(c).select({ total: count() }).from(account).where(and(...normalConditions)).get(),
				orm(c).select().from(account).where(and(...archivedConditions))
					.orderBy(desc(account.sort), asc(account.accountId))
					.all(),
				orm(c).select({ total: count() }).from(account).where(and(...archivedConditions)).get(),
				this.selectTagList(c, userId)
			]);

			return {
				normal: {
					list: normalList.map(item => this.formatAccountRow(item)),
					total: normalTotalRow.total
				},
				archived: {
					list: archivedList.map(item => this.formatAccountRow(item)),
					total: archivedTotalRow.total
				},
				tagList
			};
		}

		if (!accountId) {
			accountId = 0;
		}

		if (Number.isNaN(lastSort)) {
			lastSort = 9999999999;
		}

		const normalConditions = [
			eq(account.userId, userId),
			eq(account.isDel, isDel.NORMAL),
			eq(account.status, accountConst.status.NORMAL),
			or(
				lt(account.sort, lastSort),
				and(
					eq(account.sort, lastSort),
					gt(account.accountId, accountId)
				)
			)
		];

		if (keyword) {
			normalConditions.push(
				or(
					sql`${account.email} COLLATE NOCASE LIKE ${`%${keyword}%`}`,
					sql`${account.name} COLLATE NOCASE LIKE ${`%${keyword}%`}`
				)
			);
		}

		if (tag) {
			normalConditions.push(this.createTagCondition(tag));
		}

		const archivedConditions = this.buildListConditions(userId, keyword, tag, accountConst.status.ARCHIVED);
		const [normalList, archivedList, tagList] = await Promise.all([
			orm(c).select().from(account).where(and(...normalConditions))
				.orderBy(desc(account.sort), asc(account.accountId))
				.limit(size)
				.all(),
			orm(c).select().from(account).where(and(...archivedConditions))
				.orderBy(desc(account.sort), asc(account.accountId))
				.all(),
			this.selectTagList(c, userId)
		]);

		return {
			normal: {
				list: normalList.map(item => this.formatAccountRow(item))
			},
			archived: {
				list: archivedList.map(item => this.formatAccountRow(item))
			},
			tagList
		};
	},

	async delete(c, params, userId) {

		let { accountId } = params;

		const user = await userService.selectById(c, userId);
		const accountRow = await this.selectById(c, accountId);

		if (accountRow.email === user.email) {
			throw new BizError(t('delMyAccount'));
		}

		if (accountRow.userId !== user.userId) {
			throw new BizError(t('noUserAccount'));
		}

		await orm(c).update(account).set({ isDel: isDel.DELETE }).where(
			and(eq(account.userId, userId),
				eq(account.accountId, accountId)))
			.run();
	},

	selectById(c, accountId) {
		return orm(c).select().from(account).where(
			and(eq(account.accountId, accountId),
				eq(account.isDel, isDel.NORMAL)))
			.get();
	},

	async insert(c, params) {
		await orm(c).insert(account).values({ ...params }).returning();
	},

	async insertList(c, list) {
		await orm(c).insert(account).values(list).run();
	},

	async physicsDeleteByUserIds(c, userIds) {
		await emailService.physicsDeleteUserIds(c, userIds);
		await orm(c).delete(account).where(inArray(account.userId, userIds)).run();
	},

	async selectUserAccountCountList(c, userIds, del = isDel.NORMAL) {
		const result = await orm(c)
			.select({
				userId: account.userId,
				count: count(account.accountId)
			})
			.from(account)
			.where(and(
				inArray(account.userId, userIds),
				eq(account.isDel, del)
			))
			.groupBy(account.userId);
		return result;
	},

	async countUserAccount(c, userId) {
		const { num } = await orm(c).select({ num: count() }).from(account).where(and(eq(account.userId, userId), eq(account.isDel, isDel.NORMAL))).get();
		return num;
	},

	async restoreByEmail(c, email) {
		await orm(c).update(account).set({ isDel: isDel.NORMAL }).where(eq(account.email, email)).run();
	},

	async restoreByUserId(c, userId) {
		await orm(c).update(account).set({ isDel: isDel.NORMAL }).where(eq(account.userId, userId)).run();
	},

	async setName(c, params, userId) {
		const { name, accountId } = params;
		if (name.length > 30) {
			throw new BizError(t('usernameLengthLimit'));
		}
		await orm(c).update(account).set({ name }).where(and(eq(account.userId, userId), eq(account.accountId, accountId))).run();
	},

	async setTags(c, params, userId) {
		const { accountId, tags = [] } = params;
		const accountRow = await this.selectById(c, accountId);
		if (!accountRow || accountRow.userId !== userId) {
			throw new BizError(t('noUserAccount'));
		}
		await orm(c).update(account).set({ tags: this.serializeTags(tags) }).where(and(eq(account.accountId, accountId), eq(account.userId, userId))).run();
	},

	async setArchive(c, params, userId) {
		const { accountId, archived } = params;
		const userRow = await userService.selectById(c, userId);
		const accountRow = await this.selectById(c, accountId);
		if (!accountRow || accountRow.userId !== userId) {
			throw new BizError(t('noUserAccount'));
		}
		if (archived && accountRow.email === userRow.email) {
			throw new BizError(t('archiveMyAccount'));
		}
		await orm(c).update(account).set({ status: archived ? accountConst.status.ARCHIVED : accountConst.status.NORMAL }).where(and(eq(account.accountId, accountId), eq(account.userId, userId))).run();
	},

	async allAccount(c, params) {

		let { userId, num, size } = params;

		userId = Number(userId);
		num = Number(num);
		size = Number(size);

		if (size > 30) {
			size = 30;
		}

		num = (num - 1) * size;

		const userRow = await userService.selectByIdIncludeDel(c, userId);

		const list = await orm(c).select().from(account).where(and(eq(account.userId, userId), ne(account.email, userRow.email))).limit(size).offset(num);
		const { total } = await orm(c).select({ total: count() }).from(account).where(eq(account.userId, userId)).get();

		return { list, total };
	},

	async physicsDelete(c, params) {
		const { accountId } = params;
		await emailService.physicsDeleteByAccountId(c, accountId);
		await orm(c).delete(account).where(eq(account.accountId, accountId)).run();
	},

	async setAllReceive(c, params, userId) {
		const { accountId } = params;
		const accountRow = await this.selectById(c, accountId);
		if (accountRow.userId !== userId) {
			return;
		}
		await orm(c).update(account).set({ allReceive: accountConst.allReceive.CLOSE }).where(eq(account.userId, userId)).run();
		await orm(c).update(account).set({ allReceive: accountRow.allReceive ? 0 : 1 }).where(eq(account.accountId, accountId)).run();
	},

	async setAsTop(c, params, userId) {
		const { accountId } = params;
		const userRow = await userService.selectById(c, userId);
		const mainAccountRow = await accountService.selectByEmailIncludeDel(c, userRow.email);
		let mainSort = mainAccountRow.sort === 0 ? 2 : mainAccountRow.sort + 1;
		await orm(c).update(account).set({ sort: mainSort }).where(eq(account.email, userRow.email)).run();
		await orm(c).update(account).set({ sort: mainSort - 1 }).where(and(eq(account.accountId, accountId), eq(account.userId, userId))).run();
	}
};

export default accountService;
