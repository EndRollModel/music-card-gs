/** ----- excel ----- **/
let sheetID = PropertiesService.getScriptProperties().getProperty('sheetID');

/** -----server----- **/
let clientToken = PropertiesService.getScriptProperties().getProperty('clientToken');
// spotify - developer project id
let projectID = PropertiesService.getScriptProperties().getProperty('projectID');
// project redirect url
let redirect_uri = PropertiesService.getScriptProperties().getProperty('redirect_uri');

/** -----spotify api url----- */
let userInfo_url = 'https://api.spotify.com/v1/me';
let token_url = 'https://accounts.spotify.com/api/token';
let nowPlay_url = 'https://api.spotify.com/v1/me/player/currently-playing';
let recently_url = 'https://api.spotify.com/v1/me/player/recently-played';

// scopes option
// 根據需求可以要求使用範圍 詳細可查 : https://developer.spotify.com/documentation/general/guides/scopes/
// 此項目獲取以下權限: 讀取歷史播放, 讀取現在播放
const scopes = [
    'user-read-recently-played',
    'user-read-currently-playing',
]

function doPost(e) {
}

function doGet(e) {
    const param = e.parameter;
    // ----- oauth2 -----
    const code = param.code;
    // ----- getCard -----
    const id = param.id;
    // -----------------
    if (code !== undefined) { // 如果兩者皆無則不做事
        let userToken = getAuthToken(code);
        let userInfo = '';
        if (userToken['access_token'] !== undefined) { // 有token的話
            // code -> checkUser -> no this user -> add userRow
            userInfo = getUserID(userToken);
            const isExist = checkUser(userInfo.id);
            if (!isExist) { // 不存在則新增 否則回傳已經紀錄的內容
                const add = addUser(userInfo, userToken);
                if (add) {
                    return ContentService.createTextOutput(stateBack('ok', `${redirect_uri}?id=${userInfo.id}`)).setMimeType(ContentService.MimeType.JSON);
                } else {
                    return ContentService.createTextOutput(stateBack('fail', `create userData fail`)).setMimeType(ContentService.MimeType.JSON);
                }
            } else {
                return ContentService.createTextOutput(stateBack('ok', `${redirect_uri}?id=${userInfo.id}`)).setMimeType(ContentService.MimeType.JSON);
            }
        } else {
            // 如果沒有任何token回傳的話
            Logger.log('getAuthToken no get token');
            return ContentService.createTextOutput(stateBack('fail', `not auth user`)).setMimeType(ContentService.MimeType.JSON);
        }
    } else if (id !== undefined) { // 尋找id
        // 製作卡片 getID (參)
        const userInfo = searchUser(id);
        if (userInfo.hasOwnProperty('refresh')) {
            const token = getNewToken(userInfo.refresh);
            const nowPlay = getNowPlay(token)
            // now play not found -> get recently
            if (nowPlay.hasOwnProperty('name')) {
                return ContentService.createTextOutput(stateBack('ok', nowPlay)).setMimeType(ContentService.MimeType.JSON);
            } else {
                const recentlyPlay = getRecentlyPlay(token);
                if (recentlyPlay.hasOwnProperty('name')) {
                    return ContentService.createTextOutput(stateBack('ok', recentlyPlay)).setMimeType(ContentService.MimeType.JSON);
                } else {
                    return ContentService.createTextOutput(stateBack('fail', `not have play now`)).setMimeType(ContentService.MimeType.JSON);
                }
            }
        } else {
            return ContentService.createTextOutput(stateBack('fail', `no found`)).setMimeType(ContentService.MimeType.JSON);
        }
    } else {
        return;
    }
}

/** 製作Oauth的許可網址 / made oauth url */
function createUrl() {
    let authUrl = 'https://accounts.spotify.com/authorize'
    let param = {
        client_id: projectID,
        response_type: 'code',
        redirect_uri: redirect_uri,
        scope: scopes.toString(),
    }
    Logger.log(authUrl.addQuery(param));
    return authUrl.addQuery(param)
}

// ----- spotify -----

/**
 * from authCode get user token
 * @param code
 * @return {object} { access_token, token_type, expires_in, refresh_token, scope }
 */
function getAuthToken(code) {
    Logger.log('start getAuthToken');
    const requestOption = {
        method: 'POST',
        headers: {
            Authorization: clientToken,
            // 'Content-Type' : 'application/x-www-form-urlencoded'
        },
        payload: {
            'grant_type': 'authorization_code',
            code: code,
            redirect_uri: (redirect_uri),
        },
    }
    const res = UrlFetchApp.fetch(token_url, requestOption);
    // Logger.log(res.getContentText())
    return JSON.parse(res.getContentText());
}

/**
 * get userId
 * @param token
 * @return {any}
 */
function getUserID(token) {
    if (token !== undefined) {
        const requestOption = {
            method: 'GET',
            headers: {
                Authorization: `${token['token_type']} ${token['access_token']}`
            }
        }
        const res = UrlFetchApp.fetch(userInfo_url, requestOption);
        return JSON.parse(res.getContentText())
    } else {
        return '';
    }
}

function getNewToken(token) {
    // Logger.log('start getNewToken');
    const requestOption = {
        method: 'POST',
        headers: {
            Authorization: clientToken,
            // 'Content-Type' : 'application/x-www-form-urlencoded'
        },
        payload: {
            'grant_type': 'refresh_token',
            refresh_token: token,
        },
    }
    const res = UrlFetchApp.fetch(token_url, requestOption);
    // Logger.log(res.getContentText())
    return JSON.parse(res.getContentText());
}

function getNowPlay(token) {
    // Logger.log('start getNowPlay');
    const returnObj = {}
    const requestOption = {
        method: 'GET',
        headers: {
            Authorization: `${token['token_type']} ${token['access_token']}`,
            // 'Content-Type' : 'application/x-www-form-urlencoded'
        }
    }
    const res = UrlFetchApp.fetch(nowPlay_url + '?market=tw', requestOption);
    // Logger.log(res.getContentText())
    if (res.getContentText() != '') {
        const resNowPlay = JSON.parse(res.getContentText());
        if (resNowPlay.hasOwnProperty('item')) {
            returnObj.type = 'now'
            returnObj.singer = resNowPlay.item.album.artists[0].name;
            returnObj.name = resNowPlay.item.name;
            returnObj.pic = imageToBase(resNowPlay.item.album.images[1].url);
        }
    }
    return returnObj
}

function getRecentlyPlay(token) {
    const returnObj = {}
    const requestOption = {
        method: 'GET',
        headers: {
            Authorization: `${token['token_type']} ${token['access_token']}`,
            // 'Content-Type' : 'application/x-www-form-urlencoded'
        }
    }
    const res = UrlFetchApp.fetch(recently_url + '?limit=1', requestOption);
    // Logger.log(res.getContentText())
    if (res.getContentText() != '') {
        const recentlyPlay = JSON.parse(res.getContentText());
        if (recentlyPlay.hasOwnProperty('items')) {
            returnObj.type = 'recently';
            returnObj.singer = recentlyPlay.items[0].track.album.artists[0].name;
            returnObj.name = recentlyPlay.items[0].track.name;
            returnObj.pic = imageToBase(recentlyPlay.items[0].track.album.images[1].url);
        }
    }
    return returnObj
}

// ----- Sheet function -----
function loadSheet() {
    let spreadsheet = SpreadsheetApp.openById(sheetID); // Sheet id
    let sheet = spreadsheet.getSheets()[0]; // 選擇分頁標籤 回傳分頁資訊
    return sheet;
}

function addUser(userInfo, userToken) {
    try {
        const sheet = loadSheet();
        sheet.appendRow([userInfo.id, userToken['refresh_token'], userInfo['display_name']]);
    } catch (e) {
        Logger.log(e.toString());
        return false;
    }
    return true;
}

function searchUser(userID) {
    const sheet = loadSheet();
    let rowLength = sheet.getLastRow() - 1; //取行長度
    let columnLength = sheet.getLastColumn(); //取列長度
    let data = sheet.getRange(2, 1, rowLength, columnLength).getValues(); // 取得的資料
    let returnObj = {};
    for (let i = 0; i < data.length; i++) {
        if (data[i][0] == userID) {
            returnObj = {id: data[i][0], refresh: data[i][1]}
        }
    }
    return returnObj;
}

function checkUser(userID) {
    const sheet = loadSheet();
    let rowLength = sheet.getLastRow() - 1; //取行長度
    let columnLength = sheet.getLastColumn(); //取列長度
    let data = sheet.getRange(2, 1, rowLength, columnLength).getValues(); // 取得的資料
    let check = false;
    for (let i = 0; i < data.length; i++) {
        if (data[i][0] == userID) {
            check = true
        }
    }
    return check;
}

// ----- other function -----

// made image base64
function imageToBase(url) {
    // jpeg 320 / 320
    let response = UrlFetchApp.fetch(url);
    let fileBlob = response.getBlob().getBytes();
    let base64 = Utilities.base64Encode(fileBlob);
    return `data:image/jpeg;base64,${base64}`
}

function stateBack(state, message) {
    let stateObj = {};
    stateObj.state = state;
    stateObj.message = message
    return JSON.stringify(stateObj);
}

// gas not have UrlSearchParams use it
// from https://gist.github.com/tanaikech/70503e0ea6998083fcb05c6d2a857107
String.prototype.addQuery = function (obj) {
    return this + Object.keys(obj).reduce(function (p, e, i) {
        return p + (i == 0 ? "?" : "&") +
            (Array.isArray(obj[e]) ? obj[e].reduce(function (str, f, j) {
                return str + e + "=" + encodeURIComponent(f) + (j != obj[e].length - 1 ? "&" : "")
            }, "") : e + "=" + encodeURIComponent(obj[e]));
    }, "");
}
