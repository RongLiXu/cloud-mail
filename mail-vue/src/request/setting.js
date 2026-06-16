import http from '@/axios/index.js';

export function settingSet(setting) {
    return http.put('/setting/set', setting)
}

export function settingQuery() {
    return http.get('/setting/query')
}

export function websiteConfig() {
    return http.get('/setting/websiteConfig')
}

export function setBackground(background) {
    return http.put('/setting/setBackground',{background})
}

export function deleteBackground() {
    return http.delete('/setting/deleteBackground')
}

export function setBlackList(params) {
    return http.put('/setting/setBlacklist', params)
}

export function backupConfigGet() {
    return http.get('/backup/config')
}

export function backupConfigSet(config) {
    return http.put('/backup/config', config)
}

export function backupExport() {
    return http.get('/backup/export', { responseType: 'blob' })
}

export function backupPush() {
    return http.post('/backup/push')
}

export function backupPull() {
    return http.post('/backup/pull')
}

export function backupTestConnection() {
    return http.post('/backup/test-connection')
}