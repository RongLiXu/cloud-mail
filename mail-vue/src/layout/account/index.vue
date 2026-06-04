<template>
  <div class="account-box">
    <div class="head-opt">
      <Icon v-perm="'account:add'" class="icon add" icon="ion:add-outline" width="23" height="23" @click="add"/>
      <Icon class="icon refresh" icon="ion:reload" width="18" height="18" @click="refresh"/>
    </div>
    <div class="search-wrap">
      <el-input
          v-model.trim="searchKeyword"
          clearable
          :placeholder="$t('searchByEmail')"
      >
        <template #prefix>
          <Icon icon="iconoir:search" width="16" height="16"/>
        </template>
      </el-input>
    </div>
    <div class="tag-wrap" v-if="tagOptions.length > 0">
      <div class="tag-title">{{ $t('tagFilter') }}</div>
      <div class="tag-list">
        <el-tag
            class="filter-tag"
            :effect="selectedTag === '' ? 'dark' : 'plain'"
            @click="changeTag('')"
        >
          {{ $t('all') }}
        </el-tag>
        <el-tag
            v-for="tag in tagOptions"
            :key="tag.name"
            class="filter-tag"
            :effect="selectedTag === tag.name ? 'dark' : 'plain'"
            @click="changeTag(tag.name)"
        >
          {{ tag.name }}<span class="tag-count">({{ tag.count }})</span>
        </el-tag>
      </div>
    </div>
    <el-scrollbar class="scrollbar" ref="scrollbarRef">
      <div v-infinite-scroll="getAccountList" :infinite-scroll-distance="600" :infinite-scroll-immediate="false">
        <template v-if="!loading">
          <template v-for="item in normalAccounts" :key="`normal-${item.accountId}`">
            <el-card class="item" :class="itemBg(item.accountId)" @click="changeAccount(item)">
              <div class="account-info">
                <div class="account">
                  {{ item.email }}
                </div>
                <div class="name" v-if="item.name && item.name !== item.email">
                  {{ item.name }}
                </div>
                <div class="tags" v-if="item.tags?.length">
                  <el-tag v-for="tag in item.tags" :key="`${item.accountId}-${tag}`" size="small" effect="plain">{{ tag }}</el-tag>
                </div>
              </div>
              <div class="opt">
                <div class="send-email" @click.stop>
                  <Icon @click="setAllReceive(item)" v-if="!item.allReceive" icon="eva:email-fill" width="22" height="22" color="#fccb1a"/>
                  <Icon @click="setAllReceive(item)" v-else icon="flat-color-icons:folder" width="22" height="22" color="#23c4f1"/>
                </div>
                <div class="settings" @click.stop>
                  <Icon icon="fluent-color:clipboard-24" width="22" height="22" @click.stop="copyAccount(item.email)"/>
                  <Icon icon="fluent:settings-24-filled" width="21" height="21" color="#909399"
                        v-if="showNullSetting(item)"/>
                  <el-dropdown v-else>
                    <Icon icon="fluent:settings-24-filled" width="21" height="21" color="#909399"/>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item v-if="hasPerm('email:send')" @click="openSetName(item)">{{ $t('rename') }}</el-dropdown-item>
                        <el-dropdown-item @click="openTags(item)">{{ $t('editTags') }}</el-dropdown-item>
                        <el-dropdown-item v-if="item.accountId !== userStore.user.account.accountId" @click="setAsTop(item)">{{ $t('pin') }}</el-dropdown-item>
                        <el-dropdown-item v-if="item.accountId !== userStore.user.account.accountId" @click="toggleArchive(item, true)">{{ $t('archive') }}</el-dropdown-item>
                        <el-dropdown-item v-if="item.accountId !== userStore.user.account.accountId && hasPerm('account:delete')"
                                          @click="remove(item)">{{ $t('delete') }}
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </div>
            </el-card>
          </template>

          <div class="archive-section" v-if="archivedAccounts.length > 0">
            <div class="archive-head" @click="archivedExpanded = !archivedExpanded">
              <div class="archive-title">
                <Icon :icon="archivedExpanded ? 'mingcute:down-small-fill' : 'mingcute:right-small-fill'" width="18" height="18"/>
                <span>{{ $t('archived') }}</span>
                <span class="archive-count">({{ archivedAccounts.length }})</span>
              </div>
            </div>
            <div v-show="archivedExpanded">
              <template v-for="item in archivedAccounts" :key="`archived-${item.accountId}`">
                <el-card class="item archived-item" :class="itemBg(item.accountId)" @click="changeAccount(item)">
                  <div class="account-info">
                    <div class="account">
                      {{ item.email }}
                    </div>
                    <div class="name" v-if="item.name && item.name !== item.email">
                      {{ item.name }}
                    </div>
                    <div class="tags" v-if="item.tags?.length">
                      <el-tag v-for="tag in item.tags" :key="`${item.accountId}-${tag}`" size="small" effect="plain">{{ tag }}</el-tag>
                    </div>
                  </div>
                  <div class="opt">
                    <div class="send-email" @click.stop>
                      <Icon @click="setAllReceive(item)" v-if="!item.allReceive" icon="eva:email-fill" width="22" height="22" color="#fccb1a"/>
                      <Icon @click="setAllReceive(item)" v-else icon="flat-color-icons:folder" width="22" height="22" color="#23c4f1"/>
                    </div>
                    <div class="settings" @click.stop>
                      <Icon icon="fluent-color:clipboard-24" width="22" height="22" @click.stop="copyAccount(item.email)"/>
                      <Icon icon="fluent:settings-24-filled" width="21" height="21" color="#909399"
                            v-if="showNullSetting(item)"/>
                      <el-dropdown v-else>
                        <Icon icon="fluent:settings-24-filled" width="21" height="21" color="#909399"/>
                        <template #dropdown>
                          <el-dropdown-menu>
                            <el-dropdown-item v-if="hasPerm('email:send')" @click="openSetName(item)">{{ $t('rename') }}</el-dropdown-item>
                            <el-dropdown-item @click="openTags(item)">{{ $t('editTags') }}</el-dropdown-item>
                            <el-dropdown-item @click="toggleArchive(item, false)">{{ $t('unarchive') }}</el-dropdown-item>
                            <el-dropdown-item v-if="item.accountId !== userStore.user.account.accountId && hasPerm('account:delete')"
                                              @click="remove(item)">{{ $t('delete') }}
                            </el-dropdown-item>
                          </el-dropdown-menu>
                        </template>
                      </el-dropdown>
                    </div>
                  </div>
                </el-card>
              </template>
            </div>
          </div>

          <div class="empty" v-if="noLoading && normalAccounts.length === 0 && archivedAccounts.length === 0">
            <el-empty :description="$t('noMessagesFound')"/>
          </div>
        </template>

        <template v-if="loading">
          <el-skeleton v-for="i in skeletonRows" :key="i" animated>
            <template #template>
              <el-card class="item">
                <el-skeleton-item variant="p" style="width: 70%; height: 20px; margin-bottom: 25px"/>
                <div style="display: flex; justify-content: space-between">
                  <el-skeleton-item variant="text" style="width: 20px"/>
                  <el-skeleton-item variant="text" style="width: 20px"/>
                </div>
              </el-card>
            </template>
          </el-skeleton>
        </template>

        <template v-if="normalAccounts.length + archivedAccounts.length > 0 && !noLoading && !selectedTag">
          <el-skeleton animated>
            <template #template>
              <el-card class="item">
                <el-skeleton-item variant="p" style="width: 70%; height: 20px; margin-bottom: 20px"/>
                <div style="display: flex; justify-content: space-between">
                  <el-skeleton-item variant="text" style="width: 20px"/>
                  <el-skeleton-item variant="text" style="width: 20px"/>
                </div>
              </el-card>
            </template>
          </el-skeleton>
        </template>

        <div class="noLoading" v-if="noLoading && normalAccounts.length + archivedAccounts.length > 0 && !selectedTag">
          <div>{{ $t('noMoreData') }}</div>
        </div>
      </div>
    </el-scrollbar>
    <el-dialog v-model="showAdd" :title="$t('addAccount')">
      <div class="container">
        <el-input v-model="addForm.email" ref="addRef" type="text" :placeholder="$t('emailAccount')" autocomplete="off">
          <template #append>
            <div @click.stop="openSelect">
              <el-select
                  ref="mySelect"
                  v-model="addForm.suffix"
                  :placeholder="$t('select')"
                  class="select"
              >
                <el-option
                    v-for="item in domainList"
                    :key="item"
                    :label="item"
                    :value="item"
                />
              </el-select>
              <div>
                <span>{{ addForm.suffix }}</span>
                <Icon class="setting-icon" icon="mingcute:down-small-fill" width="20" height="20"/>
              </div>
            </div>
          </template>
        </el-input>
        <el-button class="btn" type="primary" @click="submit" :loading="addLoading">{{ $t('add') }}</el-button>
      </div>
      <div
          class="add-email-turnstile"
          :class="verifyShow ? 'turnstile-show' : 'turnstile-hide'"
          :data-sitekey="settingStore.settings.siteKey"
          data-callback="onTurnstileSuccess"
          data-error-callback="onTurnstileError"
      >
        <span style="font-size: 12px;color: #F56C6C" v-if="botJsError">{{ $t('verifyModuleFailed') }}</span>
      </div>
    </el-dialog>
    <el-dialog v-model="setNameShow" :title="$t('changeUserName')">
      <div class="container">
        <el-input v-model="accountName" type="text" :placeholder="$t('username')" autocomplete="off">
        </el-input>
        <el-button class="btn" type="primary" @click="setName" :loading="setNameLoading">{{ $t('save') }}</el-button>
      </div>
    </el-dialog>
    <el-dialog v-model="tagDialogShow" :title="$t('editTags')">
      <div class="container tag-dialog">
        <el-select
            v-model="editingTags"
            multiple
            filterable
            allow-create
            default-first-option
            :reserve-keyword="false"
            :placeholder="$t('tags')"
            class="tag-select"
        >
          <el-option
              v-for="tag in tagOptions"
              :key="tag.name"
              :label="tag.name"
              :value="tag.name"
          />
        </el-select>
        <el-button class="btn" type="primary" @click="saveTags" :loading="tagSaving">{{ $t('save') }}</el-button>
      </div>
    </el-dialog>
  </div>
</template>
<script setup>
import {Icon} from "@iconify/vue";
import {computed, nextTick, onBeforeUnmount, reactive, ref, watch} from "vue";
import {
  accountList,
  accountAdd,
  accountDelete,
  accountSetName,
  accountSetAllReceive,
  accountSetAsTop,
  accountArchive,
  accountSetTags
} from "@/request/account.js";
import {sleep} from "@/utils/time-utils.js"
import {isEmail} from "@/utils/verify-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import {useUserStore} from "@/store/user.js";
import {hasPerm} from "@/perm/perm.js"
import {useI18n} from "vue-i18n";
import {AccountAllReceiveEnum} from "@/enums/account-enum.js";

const {t} = useI18n();
const userStore = useUserStore();
const accountStore = useAccountStore();
const settingStore = useSettingStore();
const emailStore = useEmailStore();
const showAdd = ref(false)
const addLoading = ref(false);
const domainList = computed(() => settingStore.domainList)
const normalAccounts = reactive([])
const archivedAccounts = reactive([])
const tagOptions = reactive([])
const selectedTag = ref('')
const archivedExpanded = ref(false)
const searchKeyword = ref('')
let searchTimer = null
const noLoading = ref(false)
const loading = ref(false)
const followLoading = ref(false)
const verifyShow = ref(false)
const setNameShow = ref(false)
const setNameLoading = ref(false)
const accountName = ref(null)
const addRef = ref({})
const scrollbarRef = ref({})
const tagDialogShow = ref(false)
const tagSaving = ref(false)
const editingTags = ref([])
let editingAccount = null
let account = null
let turnstileId = null
const botJsError = ref(false)
let verifyToken = ''
let verifyErrorCount = 0
const addForm = reactive({
  email: '',
  suffix: settingStore.domainList[0]
})
let skeletonRows = 10
const queryParams = reactive({
  size: 30,
  accountId: 0,
  lastSort: null
})

const mySelect = ref()

if (hasPerm('account:query')) {
  getAccountList()
}

watch(() => accountStore.changeUserAccountName, (name) => {
  const currentAccount = findAccountById(accountStore.currentAccountId)
  if (currentAccount) {
    currentAccount.name = name
  }
})

watch(searchKeyword, () => {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }

  searchTimer = setTimeout(() => {
    refresh()
  }, 250)
})

onBeforeUnmount(() => {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
})

watch(() => settingStore.domainList, (list) => {
  if (!addForm.suffix && list.length > 0) {
    addForm.suffix = list[0]
  }
}, {immediate: true})

const openSelect = () => {
  mySelect.value.toggleMenu()
}

window.onTurnstileError = (e) => {
  if (verifyErrorCount >= 4) {
    return
  }
  verifyErrorCount++
  console.warn('人机验加载失败', e)
  setTimeout(() => {
    nextTick(() => {
      if (!turnstileId) {
        turnstileId = window.turnstile.render('.add-email-turnstile')
      } else {
        window.turnstile.reset(turnstileId);
      }
    })
  }, 1500)
};

window.onTurnstileSuccess = (token) => {
  verifyToken = token;
};

function getAllAccounts() {
  return [...normalAccounts, ...archivedAccounts]
}

function findAccountById(accountId) {
  return getAllAccounts().find(item => item.accountId === accountId)
}

function replaceList(target, list) {
  target.splice(0, target.length, ...list)
}

function getSkeletonRows() {
  const length = normalAccounts.length + archivedAccounts.length
  if (length > 20) return skeletonRows = 20
  if (length === 0) return skeletonRows = 1
  skeletonRows = length
}

function changeTag(tag) {
  if (selectedTag.value === tag) {
    return
  }
  selectedTag.value = tag
  refresh()
}

function setName() {
  const name = accountName.value

  if (name === account.name) {
    setNameShow.value = false
    return
  }

  if (!name) {
    ElMessage({
      message: t('emptyUserNameMsg'),
      type: 'error',
      plain: true,
    })
    return;
  }

  setNameLoading.value = true
  accountSetName(account.accountId, name).then(() => {
    account.name = name
    setNameShow.value = false

    if (account.accountId === userStore.user.account.accountId) {
      userStore.user.name = name
    }

    ElMessage({
      message: t('saveSuccessMsg'),
      type: "success",
      plain: true
    })
  }).finally(() => {
    setNameLoading.value = false
  })
}

function openSetName(accountItem) {
  accountName.value = accountItem.name
  account = accountItem
  setNameShow.value = true
}

function openTags(accountItem) {
  editingAccount = accountItem
  editingTags.value = [...(accountItem.tags || [])]
  tagDialogShow.value = true
}

function saveTags() {
  if (!editingAccount) {
    return
  }
  tagSaving.value = true
  accountSetTags(editingAccount.accountId, editingTags.value).then(() => {
    editingAccount.tags = [...editingTags.value]
    tagDialogShow.value = false
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })
    return getAccountList()
  }).finally(() => {
    tagSaving.value = false
  })
}

function setAllReceive(account) {
  const allAccounts = getAllAccounts()
  const allReceiveAccount = allAccounts.find(item => item.allReceive === AccountAllReceiveEnum.ENABLED);
  if (allReceiveAccount && allReceiveAccount.accountId !== account.accountId) allReceiveAccount.allReceive = AccountAllReceiveEnum.DISABLED;
  account.allReceive = account.allReceive === AccountAllReceiveEnum.DISABLED ? AccountAllReceiveEnum.ENABLED : AccountAllReceiveEnum.DISABLED;
  accountSetAllReceive(account.accountId).catch(() => {
    account.allReceive = account.allReceive === AccountAllReceiveEnum.DISABLED ? AccountAllReceiveEnum.ENABLED : AccountAllReceiveEnum.DISABLED;
    if (allReceiveAccount) allReceiveAccount.allReceive = AccountAllReceiveEnum.ENABLED;
  }).then(() => {
    if (account.allReceive === AccountAllReceiveEnum.ENABLED) {
      ElMessage({
        message: t('setSuccess'),
        type: 'success',
        plain: true,
      })
    }
    changeAccount(account);
    emailStore.emailScroll?.refreshList();
    emailStore.sendScroll?.refreshList();
  })
}

function toggleArchive(accountItem, archived) {
  accountArchive(accountItem.accountId, archived).then(() => {
    ElMessage({
      message: t('setSuccess'),
      type: 'success',
      plain: true,
    })
    refresh()
  })
}

function showNullSetting() {
  return false
}

function itemBg(accountId) {
  return accountStore.currentAccountId === accountId ? 'item-choose' : ''
}

function remove(account) {
  ElMessageBox.confirm(t('delConfirm', {msg: account.email}), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    accountDelete(account.accountId).then(() => {
      const normalIndex = normalAccounts.findIndex(item => item.accountId === account.accountId)
      if (normalIndex > -1) {
        normalAccounts.splice(normalIndex, 1)
      }
      const archivedIndex = archivedAccounts.findIndex(item => item.accountId === account.accountId)
      if (archivedIndex > -1) {
        archivedAccounts.splice(archivedIndex, 1)
      }
      if (normalAccounts.length + archivedAccounts.length < queryParams.size && !noLoading.value) {
        getAccountList()
      }
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true,
      })
    })
  });
}

function refresh() {
  if (loading.value) {
    return
  }
  noLoading.value = false
  followLoading.value = false
  queryParams.accountId = 0
  queryParams.lastSort = null
  getSkeletonRows();
  scrollbarRef.value?.setScrollTop?.(0)
  replaceList(normalAccounts, [])
  replaceList(archivedAccounts, [])
  getAccountList()
}

function changeAccount(account) {
  accountStore.currentAccountId = account.accountId
  accountStore.currentAccount = account
}

function add() {
  addForm.suffix = addForm.suffix || settingStore.domainList[0]
  showAdd.value = true
  setTimeout(() => {
    addRef.value.focus()
  }, 100)
}

function setAsTop(account) {
  accountSetAsTop(account.accountId).then(() => {
    ElMessage({
      message: t('setSuccess'),
      type: 'success',
      plain: true,
    })
    refresh()
  });
}

async function copyAccount(account) {
  try {
    await navigator.clipboard.writeText(account);
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true,
    })
  } catch (err) {
    console.error(`${t('copyFailMsg')}:`, err);
    ElMessage({
      message: t('copyFailMsg'),
      type: 'error',
      plain: true,
    })
  }
}

function selectFallbackAccount() {
  const currentAccount = findAccountById(accountStore.currentAccountId)
  if (currentAccount) {
    accountStore.currentAccount = currentAccount
    return
  }
  if (normalAccounts.length > 0) {
    changeAccount(normalAccounts[0])
    return
  }
  if (archivedAccounts.length > 0) {
    changeAccount(archivedAccounts[0])
  }
}

function getAccountList() {
  if (loading.value || followLoading.value || noLoading.value) return Promise.resolve();

  const hasTagFilter = !!selectedTag.value

  if (normalAccounts.length + archivedAccounts.length === 0) {
    loading.value = true
  } else {
    followLoading.value = true
  }
  const start = Date.now();

  const accountId = hasTagFilter ? 0 : (normalAccounts.length > 0 ? normalAccounts.at(-1).accountId : queryParams.accountId || 0)
  const lastSort = hasTagFilter ? null : (normalAccounts.length > 0 ? normalAccounts.at(-1).sort : queryParams.lastSort)
  const requestParams = {
    accountId,
    size: queryParams.size,
    lastSort,
    keyword: searchKeyword.value,
    tag: selectedTag.value
  }

  if (hasTagFilter) {
    requestParams.num = 1
  }

  return accountList(requestParams).then(async (data) => {
    const end = Date.now();
    const duration = end - start;
    if (duration < 300) {
      await sleep(300 - duration)
    }

    const isPagedTagResponse = !Array.isArray(data)
    const normalList = isPagedTagResponse ? (data.normal?.list || []) : data.filter(item => item.status !== 1)
    const archivedList = isPagedTagResponse ? (data.archived?.list || []) : data.filter(item => item.status === 1)

    if (isPagedTagResponse || hasTagFilter) {
      replaceList(normalAccounts, normalList)
    } else {
      normalAccounts.push(...normalList)
    }
    replaceList(archivedAccounts, archivedList)
    if (isPagedTagResponse && Array.isArray(data.tagList)) {
      replaceList(tagOptions, data.tagList)
    }

    if ((isPagedTagResponse ? normalList.length : normalList.length + archivedList.length) < queryParams.size) {
      noLoading.value = true
    }

    if (archivedAccounts.length > 0) {
      archivedExpanded.value = true
    }

    selectFallbackAccount()
  }).finally(() => {
    loading.value = false
    followLoading.value = false
  })
}

function submit() {
  if (!addForm.email) {
    ElMessage({
      message: t('emptyEmailMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (addForm.email.length < settingStore.settings.minEmailPrefix) {
    ElMessage({
      message: t('minEmailPrefix', {msg: settingStore.settings.minEmailPrefix}),
      type: 'error',
      plain: true,
    })
    return
  }

  if (!isEmail(addForm.email + addForm.suffix)) {
    ElMessage({
      message: t('notEmailMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (!verifyToken && (settingStore.settings.addEmailVerify === 0 || (settingStore.settings.addEmailVerify === 2 && settingStore.settings.addVerifyOpen))) {
    if (!verifyShow.value) {
      verifyShow.value = true
      nextTick(() => {
        if (!turnstileId) {
          try {
            turnstileId = window.turnstile.render('.add-email-turnstile')
          } catch (e) {
            botJsError.value = true
            console.log('人机验证js加载失败')
          }
        } else {
          window.turnstile.reset('.add-email-turnstile')
        }
      })
    } else if (!botJsError.value) {
      ElMessage({
        message: t('botVerifyMsg'),
        type: "error",
        plain: true
      })
    }
    return;
  }

  addLoading.value = true
  accountAdd(addForm.email + addForm.suffix, verifyToken).then((account) => {
    addLoading.value = false
    showAdd.value = false
    addForm.email = ''
    verifyToken = ''
    settingStore.settings.addVerifyOpen = account.addVerifyOpen
    ElMessage({
      message: t('addSuccessMsg'),
      type: "success",
      plain: true
    })
    verifyShow.value = false
    userStore.refreshUserInfo()
    refresh()
  }).catch(res => {
    if (res.code === 400) {
      verifyToken = ''
      if (turnstileId) {
        window.turnstile.reset(turnstileId)
      } else {
        nextTick(() => {
          turnstileId = window.turnstile.render('.add-email-turnstile')
        })
      }
      verifyShow.value = true
    }
    addLoading.value = false
  })
}
</script>
<style>
path[fill="#ffdda1"] {
  fill: #ffdd7d;
}
</style>
<style scoped lang="scss">
.account-box {
  border-right: 1px solid var(--el-border-color) !important;
  background-color: var(--el-bg-color);
  height: 100%;
  overflow: hidden;

  .head-opt {
    display: flex;
    align-items: center;
    height: 38px;
    box-shadow: var(--header-actions-border);
    padding-left: 10px;
    padding-right: 10px;

    .icon {
      cursor: pointer;
    }

    .refresh {
      margin-left: 10px;
    }

    .add {
      margin-left: 2px;
    }
  }

  .search-wrap {
    padding: 10px;
    box-shadow: var(--header-actions-border);
  }

  .tag-wrap {
    padding: 0 10px 10px;
    box-shadow: var(--header-actions-border);

    .tag-title {
      font-size: 12px;
      color: var(--secondary-text-color);
      margin-bottom: 8px;
    }

    .tag-list {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .filter-tag {
      cursor: pointer;
    }

    .tag-count {
      margin-left: 4px;
    }
  }

  .scrollbar {
    width: 100%;
    height: calc(100% - 130px);
    overflow: auto;
    @media (max-width: 767px) {
      height: calc(100% - 190px);
    }

    .empty {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
    }

    .noLoading {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 10px 0;
      color: var(--secondary-text-color);
    }
  }

  .btn {
    width: 100%;
    margin-top: 15px;
  }

  .item {
    background-color: var(--el-bg-color);
    border-radius: 8px;
    padding: 12px 10px;
    margin-bottom: 10px;
    margin-left: 10px;
    margin-right: 10px;
    cursor: pointer;

    .account-info {
      margin-bottom: 18px;
    }

    .account {
      font-weight: 600;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .name {
      font-size: 12px;
      margin-top: 6px;
      color: var(--secondary-text-color);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .tags {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 8px;
    }

    .opt {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #888;

      .settings {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .send-email {
        display: flex;
        align-items: center;
      }
    }

    :deep(.el-card__body) {
      padding: 0;
    }
  }

  .archive-section {
    padding-top: 4px;

    .archive-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 14px 10px;
      cursor: pointer;
      color: var(--secondary-text-color);
    }

    .archive-title {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 13px;
    }

    .archive-count {
      font-size: 12px;
    }
  }

  .archived-item {
    opacity: 0.9;
  }

  .item:first-child {
    margin-top: 10px;
  }

  .item-choose {
    background: var(--choose-account-background);
  }
}

.setting-icon {
  position: relative;
  top: 6px;
}

:deep(.el-input-group__append) {
  padding: 0 !important;
  padding-left: 8px !important;
  background: var(--el-bg-color);
}

:deep(.el-dialog) {
  width: 400px !important;
  @media (max-width: 440px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.select {
  position: absolute;
  right: 30px;
  width: 100px;
  opacity: 0;
  pointer-events: none;
}


.add-email-turnstile {
  margin-top: 15px;
}

.turnstile-show {
  opacity: 1;
}

.turnstile-hide {
  opacity: 0;
  pointer-events: none;
  position: fixed;
}

.tag-dialog {
  .tag-select {
    width: 100%;
  }
}
</style>
