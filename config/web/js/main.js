import * as settings from "./settings.js";
import * as functions from "./functions.js";
import * as folder from "./folder.js";
import * as search from "./search.js";
const guiVersion = "0.5.0";
const transfersQueue = [];
let settingsOpen = false;
const rcloneOS = document.getElementById("rcloneOS");
const rcloneVersion = document.getElementById("rcloneVersion");
const guiVersionSpan = document.getElementById("guiVersion");
const btnSettings = document.getElementById("btn-settings");
const settingsBlock = document.getElementById("settings");
const settingsChbxPolling = document.getElementById("chbx-polling");
const manualRefresh = document.getElementById("manualRefresh");
const btnManualRefresh = document.getElementById("btn-manualRefresh");
const indicatorGuiFrozen = document.getElementById("indicator-gui-frozen");
const inputRefreshView = document.getElementById("input-refresh-view");
const inputRefresh = document.getElementById("inputRefresh");
const currentTransfersBlock = document.getElementById("currentTransfers");
const currentTransfersCount = document.getElementById("currentTransfersCount");
const currentTransfersBody = document.getElementById("currentTransfersBody");
const completedTransfersBlock = document.getElementById("completedTransfers");
const completedTransfersCount = document.getElementById("completedTransfersCount");
const completedTransfersBody = document.getElementById("completedTransfersBody");
const leftPanelRemote = document.getElementById("leftPanelRemote");
const rightPanelRemote = document.getElementById("rightPanelRemote");
// copy
const leftPanelCommandCopy = document.getElementById("leftPanelCommandCopy");
const rightPanelCommandCopy = document.getElementById("rightPanelCommandCopy");
//move
const leftPanelCommandMove = document.getElementById("leftPanelCommandMove");
const rightPanelCommandMove = document.getElementById("rightPanelCommandMove");
//delete
const leftPanelCommandDelete = document.getElementById("leftPanelCommandDelete");
const rightPanelCommandDelete = document.getElementById("rightPanelCommandDelete");
// create new folder
const leftPanelNewFolderName = document.getElementById("leftPanelNewFolderName");
const rightPanelNewFolderName = document.getElementById("rightPanelNewFolderName");
const leftPanelCommandShowCreateFolder = document.getElementById("leftPanelCommandShowCreateFolder");
const rightPanelCommandShowCreateFolder = document.getElementById("rightPanelCommandShowCreateFolder");
const leftPanelCommandCreateFolder = document.getElementById("leftPanelCommandCreateFolder");
const rightPanelCommandCreateFolder = document.getElementById("rightPanelCommandCreateFolder");
const leftPanelCommandHideCreateFolder = document.getElementById("leftPanelCommandHideCreateFolder");
const rightPanelCommandHideCreateFolder = document.getElementById("rightPanelCommandHideCreateFolder");
// refresh
const leftPanelCommandRefresh = document.getElementById("leftPanelCommandRefresh");
const rightPanelCommandRefresh = document.getElementById("rightPanelCommandRefresh");
// search
const leftPanelSearchQuery = document.getElementById("leftPanelSearchQuery");
const rightPanelSearchQuery = document.getElementById("rightPanelSearchQuery");
const leftPanelCommandShowSearch = document.getElementById("leftPanelCommandShowSearch");
const rightPanelCommandShowSearch = document.getElementById("rightPanelCommandShowSearch");
const leftPanelCommandHideSearch = document.getElementById("leftPanelCommandHideSearch");
const rightPanelCommandHideSearch = document.getElementById("rightPanelCommandHideSearch");
window.onload = () => {
    settingsChbxPolling.checked = settings.userSettings.timerRefreshEnabled;
    inputRefreshView.value = settings.userSettings.timerRefreshView.toString();
    // check if there is login_token query parameter present
    settings.rcloneSettings.loginToken = new URLSearchParams(window.location.search).get("login_token");
    //console.debug(settings.rcloneSettings.loginToken);
    // get versions
    functions.sendRequestToRclone("/core/version", null, function (rez) {
        rcloneOS.textContent = rez["os"].concat(" (", rez["arch"], ")");
        rcloneVersion.textContent = rez["version"];
        guiVersionSpan.textContent = guiVersion;
    });
    // get remotes
    functions.sendRequestToRclone("/config/listremotes", null, function (rez) {
        updateRemotesSelects(leftPanelRemote, "leftPanelFiles", rez);
        updateRemotesSelects(rightPanelRemote, "rightPanelFiles", rez);
    });
    if (settings.userSettings.timerRefreshEnabled === false) {
        indicatorGuiFrozen.style.display = "block";
    }
    leftPanelSearchQuery.value = "";
    rightPanelSearchQuery.value = "";
    refreshView();
    btnSettings.addEventListener("click", function () {
        if (settingsOpen === false) {
            settingsBlock.style.display = "block";
        }
        else {
            settingsBlock.style.display = "none";
        }
        settingsOpen = !settingsOpen;
    });
    settingsChbxPolling.addEventListener("change", function () {
        if (this.checked === true) {
            settings.userSettings.timerRefreshEnabled = true;
            indicatorGuiFrozen.style.display = "none";
            manualRefresh.style.display = "none";
            inputRefresh.style.display = "flex";
        }
        else {
            settings.userSettings.timerRefreshEnabled = false;
            indicatorGuiFrozen.style.display = "block";
            inputRefresh.style.display = "none";
            manualRefresh.style.display = "flex";
        }
    });
    inputRefreshView.addEventListener("change", function () {
        const val = parseInt(this.value);
        if (Number.isNaN(val)) {
            alert("This value must be a number.");
            inputRefreshView.value = settings.userSettings.timerRefreshView.toString();
            return;
        }
        if (val < 1 || val > 120) {
            alert("This value can't be less than 1 or greater than 120.");
            inputRefreshView.value = settings.userSettings.timerRefreshView.toString();
            return;
        }
        settings.userSettings.timerRefreshView = val;
        window.clearInterval(settings.userSettings.timerRefreshViewInterval);
        settings.userSettings.timerRefreshViewInterval = window.setInterval(timerRefreshViewFunction, settings.userSettings.timerRefreshView * 1000);
    });
    btnManualRefresh.addEventListener("click", refreshView);
    settings.userSettings.timerRefreshViewInterval = window.setInterval(timerRefreshViewFunction, settings.userSettings.timerRefreshView * 1000);
    settings.userSettings.timerProcessQueueInterval = window.setInterval(processQueue, settings.userSettings.timerProcessQueue * 1000);
    leftPanelCommandCopy.addEventListener("click", function () { copyClicked(this, "leftPanelFiles"); });
    rightPanelCommandCopy.addEventListener("click", function () { copyClicked(this, "rightPanelFiles"); });
    leftPanelCommandMove.addEventListener("click", function () { moveClicked(this, "leftPanelFiles"); });
    rightPanelCommandMove.addEventListener("click", function () { moveClicked(this, "rightPanelFiles"); });
    leftPanelCommandDelete.addEventListener("click", function () { deleteClicked(this, "leftPanelFiles"); });
    rightPanelCommandDelete.addEventListener("click", function () { deleteClicked(this, "rightPanelFiles"); });
    // create new folder
    leftPanelNewFolderName.addEventListener("keydown", // with `keyup` the `Enter` key event gets into a "loop" on closing the alert with `Enter` too
    function (e) {
        switch (e.key) {
            case "Enter":
                folder.createFolderClicked(leftPanelCommandCreateFolder, "leftPanelFiles");
                break;
            case "Escape":
                folder.hideCreateFolder(this);
                break;
        }
    });
    rightPanelNewFolderName.addEventListener("keydown", // with `keyup` the `Enter` key event gets into a "loop" on closing the alert with `Enter` too
    function (e) {
        switch (e.key) {
            case "Enter":
                folder.createFolderClicked(rightPanelCommandCreateFolder, "rightPanelFiles");
                break;
            case "Escape":
                folder.hideCreateFolder(this);
                break;
        }
    });
    leftPanelCommandShowCreateFolder.addEventListener("click", function () { folder.showCreateFolder(this, "leftPanelFiles"); });
    rightPanelCommandShowCreateFolder.addEventListener("click", function () { folder.showCreateFolder(this, "rightPanelFiles"); });
    leftPanelCommandCreateFolder.addEventListener("click", function () { folder.createFolderClicked(this, "leftPanelFiles"); });
    rightPanelCommandCreateFolder.addEventListener("click", function () { folder.createFolderClicked(this, "rightPanelFiles"); });
    leftPanelCommandHideCreateFolder.addEventListener("click", function () { folder.hideCreateFolder(this); });
    rightPanelCommandHideCreateFolder.addEventListener("click", function () { folder.hideCreateFolder(this); });
    // refresh
    leftPanelCommandRefresh.addEventListener("click", function () { refreshClicked("leftPanelFiles"); });
    rightPanelCommandRefresh.addEventListener("click", function () { refreshClicked("rightPanelFiles"); });
    // search
    leftPanelCommandShowSearch.addEventListener("click", function () { search.showSearch(this, "leftPanelFiles"); });
    rightPanelCommandShowSearch.addEventListener("click", function () { search.showSearch(this, "rightPanelFiles"); });
    leftPanelSearchQuery.addEventListener("keyup", function (e) {
        switch (e.key) {
            case "Escape":
                search.hideSearch(this, "leftPanelFiles");
                break;
            default:
                if (functions.acceptableKeyEventForSearch(e)) {
                    search.searchQueryChanged(leftPanelSearchQuery.value, "leftPanelFiles");
                }
                break;
        }
    });
    rightPanelSearchQuery.addEventListener("keyup", function (e) {
        switch (e.key) {
            case "Escape":
                search.hideSearch(this, "rightPanelFiles");
                break;
            default:
                if (functions.acceptableKeyEventForSearch(e)) {
                    search.searchQueryChanged(rightPanelSearchQuery.value, "rightPanelFiles");
                }
                break;
        }
    });
    leftPanelCommandHideSearch.addEventListener("click", function () { search.hideSearch(this, "leftPanelFiles"); });
    rightPanelCommandHideSearch.addEventListener("click", function () { search.hideSearch(this, "rightPanelFiles"); });
};
function timerRefreshViewFunction() {
    if (settings.userSettings.timerRefreshEnabled === true) {
        refreshView();
    }
}
function updateRemotesSelects(panelRemote, panelFilesName, optionsList) {
    const newSelectObj = panelRemote.cloneNode(false);
    newSelectObj.options.add(new Option("- choose a remote -", ""));
    for (const o in optionsList["remotes"]) {
        const remote = optionsList["remotes"][o];
        let remoteText = remote;
        let availableDiskSpace = undefined;
        // try to get available disk space
        if (settings.remotes[remote] !== undefined && settings.remotes[remote]["canQueryDisk"] === true) {
            const params = {
                "fs": remote.concat(":/", settings.remotes[remote]["pathToQueryDisk"])
            };
            functions.sendRequestToRclone("/operations/about", params, function (rez) {
                availableDiskSpace = functions.getHumanReadableValue(rez["free"], "");
                remoteText = remoteText.concat(` (${availableDiskSpace} left)`);
                newSelectObj.options.add(new Option(remoteText, remote));
            });
        }
        else {
            newSelectObj.options.add(new Option(remoteText, remote));
        }
    }
    newSelectObj.addEventListener("change", function () { remoteChanged(this, panelFilesName); });
    panelRemote.parentNode.replaceChild(newSelectObj, panelRemote);
}
function remoteChanged(remotesList, filesPanelID) {
    const remote = remotesList.value;
    if (remote === "") {
        return;
    }
    //console.debug(remotes[remote]);
    openPath(remote.concat(":/", settings.remotes[remote] === undefined ? "" : settings.remotes[remote]["startingFolder"]), filesPanelID);
}
function openPath(path, filesPanelID) {
    //console.debug(path);
    if (path.trim() === "") {
        return;
    }
    const filesPanel = document.getElementById(filesPanelID);
    while (filesPanel.firstChild) {
        filesPanel.removeChild(filesPanel.firstChild);
    }
    filesPanel.parentNode.parentNode
        .getElementsByClassName("filesCount")[0].textContent = "-";
    //const firstSlash = path.indexOf("/") + 1;
    const lastSlash = path.lastIndexOf("/") + 1;
    const basePath = lastSlash !== 0 ? path.substring(0, lastSlash) : path.concat("/");
    //const currentPath = path.substring(firstSlash, path.length);
    const nextPath = lastSlash !== 0 ? path.substring(lastSlash, path.length) : "";
    const oneLevelUpPath = basePath.substring(0, lastSlash - 1).replace(/'/g, "\\'");
    const pathHint = path.replace(/^.*:/, "");
    //console.group("Paths");
    // console.debug("Last slash", lastSlash);
    //console.debug("Path:", path);
    //console.debug("Base path:", basePath);
    //console.debug("Current path:", currentPath);
    //console.debug("Next path:", nextPath);
    //console.groupEnd();
    functions.panelsPaths[filesPanelID] = path;
    const divFileLine = Object.assign(document.createElement("div"), {
        className: "fileLine folderLine"
    });
    divFileLine.addEventListener("click", () => {
        openPath(oneLevelUpPath, filesPanelID);
    });
    const img = Object.assign(document.createElement("img"), {
        className: "icon",
        src: "./images/file.svg"
    });
    divFileLine.appendChild(img);
    const p = document.createElement("p");
    const span = Object.assign(document.createElement("span"), {
        className: "path-hint"
    });
    const spanContent = document.createTextNode(`${pathHint == "/" ? "" : pathHint}/`);
    const spanContentTwoDots = document.createTextNode("..");
    span.appendChild(spanContent);
    p.appendChild(span);
    p.appendChild(spanContentTwoDots);
    //.concat(`<img src="./images/info-square.svg" style="margin-left:auto;" title="${oneLevelUpPath}">`)
    divFileLine.appendChild(p);
    filesPanel.appendChild(divFileLine);
    filesPanel.appendChild(functions.htmlToElement("<div class='loadingAnimation'></div>"));
    let params = {
        "fs": basePath,
        "remote": nextPath
    };
    functions.sendRequestToRclone("/operations/list", params, function (rez) {
        filesPanel.parentNode.parentNode
            .getElementsByClassName("loadingAnimation")[0].style.display = "none";
        if (rez === null) {
            console.error("Request returned a null value, looks like there is something wrong with the request");
            return;
        }
        const listOfFilesAndFolders = rez["list"];
        listOfFilesAndFolders.sort(functions.sortFilesAndFolders);
        //console.table(listOfFilesAndFolders);
        filesPanel.parentNode.parentNode
            .getElementsByClassName("filesCount")[0].textContent = listOfFilesAndFolders.length.toString();
        for (let r in listOfFilesAndFolders) {
            let fileName = listOfFilesAndFolders[r]["Name"];
            let fileNamePath = functions.panelsPaths[filesPanelID].concat("/", fileName);
            let folderNamePath = basePath.concat(listOfFilesAndFolders[r]["Path"]);
            const divFileList = document.createElement("div");
            divFileList.classList.add("file-list-item");
            // const inputCheckbox: HTMLInputElement = document.createElement("input");
            // inputCheckbox.type = "checkbox";
            // inputCheckbox.name = "fileListItem";
            divFileList.appendChild(Object.assign(document.createElement("input"), {
                type: "checkbox",
                name: "fileListItem"
            }));
            let divFileListItem = document.createElement("div");
            if (listOfFilesAndFolders[r]["IsDir"] === true) {
                divFileListItem = Object.assign(document.createElement("div"), {
                    className: "fileLine folderLine"
                    //dataset: { type: "folder", path: folderNamePath } // readonly, can't assign
                });
                // not very convenient
                // const dataset: {[key: string]: string} = { type: "folder", path: folderNamePath };
                // for (const d in dataset) {
                //     divFileListItem.setAttribute(`data-${d}`, dataset[d]);
                // }
                // seems to be the best way to assign dataset attributes
                Object.assign(divFileListItem.dataset, {
                    type: "folder",
                    path: folderNamePath
                });
                divFileListItem.addEventListener("click", () => {
                    openPath(folderNamePath.replace(/'/g, "\\'"), filesPanelID);
                });
            }
            else {
                divFileListItem = Object.assign(document.createElement("div"), {
                    className: "fileLine"
                });
                Object.assign(divFileListItem.dataset, {
                    type: "file",
                    path: fileNamePath
                });
            }
            divFileListItem.appendChild(Object.assign(document.createElement("img"), {
                classList: ["icon"],
                src: `./images/${functions.getIconType(listOfFilesAndFolders[r]["MimeType"])}`
            }));
            const pFileNameContent = document.createTextNode(fileName);
            const pFileName = document.createElement("p");
            pFileName.appendChild(pFileNameContent);
            divFileListItem.appendChild(pFileName);
            divFileList.appendChild(divFileListItem);
            filesPanel.appendChild(divFileList);
        }
    });
}
function updateCurrentTransfers(currentTransfers) {
    //console.table(currentTransfers);
    while (currentTransfersBody.firstChild) {
        currentTransfersBody.removeChild(currentTransfersBody.firstChild);
    }
    let addQueueElementsOnly = false;
    if (currentTransfers === undefined || !currentTransfers.length) {
        currentTransfersCount.textContent = "0";
        if (!transfersQueue.length) {
            currentTransfersBlock.style.display = "none";
            return;
        }
        else {
            addQueueElementsOnly = true;
        }
    }
    if (!addQueueElementsOnly) // add items from current transfers list
     {
        currentTransfersCount.textContent = currentTransfers.length.toString();
        currentTransfers.sort(functions.sortJobs);
        for (let t = 0; t < currentTransfers.length; t++) {
            const tr = document.createElement("tr");
            // number
            tr.appendChild(Object.assign(document.createElement("td"))).appendChild(Object.assign(document.createTextNode((t + 1).toString())));
            // name
            tr.appendChild(Object.assign(document.createElement("td"), {
                className: "canBeLong"
            })).appendChild(Object.assign(document.createTextNode(currentTransfers[t]["name"])));
            // size
            tr.appendChild(Object.assign(document.createElement("td"))).appendChild(Object.assign(document.createTextNode(functions.getHumanReadableValue(currentTransfers[t]["size"], ""))));
            // speed
            tr.appendChild(Object.assign(document.createElement("td"))).appendChild(Object.assign(document.createTextNode(functions.getHumanReadableValue(currentTransfers[t]["speed"], "/s"))));
            // progress
            tr.appendChild(Object.assign(document.createElement("td"))).appendChild(Object.assign(document.createElement("progress"), {
                value: currentTransfers[t]["percentage"],
                max: 100
            }));
            // cancel
            const imgCancel = Object.assign(document.createElement("img"), {
                src: "./images/x-square.svg"
            });
            imgCancel.addEventListener("click", function () { cancelTransfer(this, currentTransfers[t]["group"]); });
            tr.appendChild(Object.assign(document.createElement("td"))).appendChild(imgCancel);
            currentTransfersBody.appendChild(tr);
        }
    }
    // add items from the queue
    for (let q = 0; q < transfersQueue.length; q++) {
        const tr = Object.assign(document.createElement("tr"), {
            style: "font-style:italic;"
        });
        // operation type
        tr.appendChild(Object.assign(document.createElement("td"))).appendChild(Object.assign(document.createElement("code"))).appendChild(Object.assign(document.createTextNode(transfersQueue[q].operationType)));
        // target
        tr.appendChild(Object.assign(document.createElement("td"), {
            colSpan: 4,
            className: "canBeLong"
        })).appendChild(Object.assign(document.createTextNode(transfersQueue[q].dataPath)));
        // cancel
        const imgCancel = Object.assign(document.createElement("img"), {
            src: "./images/x-square.svg"
        });
        imgCancel.addEventListener("click", function () { removeFromQueue(this, q); });
        tr.appendChild(Object.assign(document.createElement("td"))).appendChild(imgCancel);
        currentTransfersBody.appendChild(tr);
    }
    currentTransfersBlock.style.display = "block";
}
function updateCompletedTransfers(completedTransfers) {
    while (completedTransfersBody.firstChild) {
        completedTransfersBody.removeChild(completedTransfersBody.firstChild);
    }
    if (completedTransfers === undefined || !completedTransfers.length) {
        // let tr = "<tr><td>-</td><td>-</td><td>-</td></tr>";
        // completedTransfersBody.appendChild(functions.htmlToElement(tr));
        completedTransfersBlock.style.display = "none";
        completedTransfersCount.textContent = "0";
        return;
    }
    let completedTransfersCnt = 0;
    completedTransfers.sort(functions.sortJobs).reverse();
    for (let t in completedTransfers) {
        // don't count checks as actual transfers
        if (completedTransfers[t]["checked"] === true) //|| completedTransfers[t]["bytes"] === 0)
         {
            continue;
        }
        completedTransfersCnt++;
        const spanOK = "<span style='color:green;'>OK</span>";
        const spanFAIL = "<span style='color:red;'>error</span>";
        // one would like to user a proper ISO date and time format,
        // such as `.toISOString().slice(0,19).replace("T", " ")`,
        // but unfortunately that would be in UTC, so one would also need
        // to convert the timezone, so fuck it, `toLocaleString()` will have to do
        const tr = `<tr>
            <td>${new Date(completedTransfers[t]["started_at"]).toLocaleString("en-GB")}</td>
            <td>${completedTransfers[t]["error"] === "" ? spanOK : spanFAIL}</td>
            <td class="canBeLong">${completedTransfers[t]["name"]}</td>
            <td>${functions.getHumanReadableValue(completedTransfers[t]["size"], "")}</td>
            </tr>`;
        completedTransfersBody.appendChild(functions.htmlToElement(tr));
    }
    completedTransfersCount.textContent = completedTransfersCnt.toString();
    completedTransfersBlock.style.display = "block";
}
function refreshView() {
    getCurrentTransfers();
    getCompletedTransfers();
    //refreshFilesListing();
}
function getCurrentTransfers() {
    functions.sendRequestToRclone("/core/stats", null, function (rez) {
        updateCurrentTransfers(rez["transferring"]);
    });
}
function getCompletedTransfers() {
    functions.sendRequestToRclone("/core/transferred", null, function (rez) {
        //console.table(rez["transferred"]);
        updateCompletedTransfers(rez["transferred"]);
    });
}
function refreshFilesListing() {
    refreshClicked("leftPanelFiles");
    refreshClicked("rightPanelFiles");
}
function cancelTransfer(cancelBtn, groupID) {
    cancelBtn.style.display = "none";
    let jobID = groupID.substring(groupID.lastIndexOf("/") + 1, groupID.length);
    let params = { "jobid": jobID };
    functions.sendRequestToRclone("/job/stop", params, function () {
        //console.debug(rez);
        refreshView();
    });
}
function removeFromQueue(removeBtn, q) {
    removeBtn.style.display = "none";
    transfersQueue.splice(q, 1);
}
function copyClicked(btn, filesPanelID) {
    operationClicked(btn, "copy", filesPanelID);
}
function moveClicked(btn, filesPanelID) {
    operationClicked(btn, "move", filesPanelID);
}
function deleteClicked(btn, filesPanelID) {
    operationClicked(btn, "delete", filesPanelID);
}
export function refreshClicked(filesPanelID) {
    if (functions.panelsPaths[filesPanelID] !== "") {
        openPath(functions.panelsPaths[filesPanelID], filesPanelID);
    }
    else {
        alert("Nothing to refresh, choose a remote first.");
    }
}
function operationClicked(btn, operationType, filesPanelID) {
    if (operationType === "copy" || operationType === "move") {
        if (functions.panelsPathsHaveValue() !== true) {
            alert("Cannot perform an operation when one of the panels does not have a remote chosen.");
            return;
        }
    }
    btn.disabled = true;
    setTimeout(function () { btn.disabled = false; }, 5000);
    addToQueue(operationType, filesPanelID);
}
function addToQueue(operationType, filesPanelID) {
    const checkedBoxes = Array.from(document.getElementById(filesPanelID)
        .querySelectorAll("input[name=fileListItem]:checked"));
    //console.debug(checkedBoxes, checkedBoxes.length);
    for (let i = 0; i < checkedBoxes.length; i++) {
        //console.debug("doing file operation");
        //console.debug(checkedBoxes[i].parentNode.parentNode.getElementsByClassName("fileLine")[0].dataset.path);
        const checkedBox = checkedBoxes[i].nextElementSibling;
        const dataPath = checkedBox.dataset.path;
        const lastSlash = dataPath.lastIndexOf("/") + 1;
        const sourcePath = dataPath.substring(0, lastSlash);
        const targetPath = dataPath.substring(lastSlash, dataPath.length);
        const dataType = checkedBox.dataset.type;
        transfersQueue.push({
            "dtAdded": new Date(),
            "operationType": operationType,
            "dataType": dataType,
            "dataPath": dataPath,
            "sourcePath": sourcePath,
            "targetPath": targetPath,
            "dstFS": dataType === "folder"
                ? functions.getDestinationPath(filesPanelID).concat("/", targetPath)
                : functions.getDestinationPath(filesPanelID).concat("/"),
            "filesPanelID": filesPanelID
        });
        checkedBoxes[i].checked = false;
    }
}
function processQueue() {
    // console.debug(
    //     currentTransfersCount.textContent,
    //     transfersQueue.length
    // );
    //console.table(transfersQueue);
    if ( // the queue is empty or of there already are active transfers
    currentTransfersCount.textContent !== "0"
        || !transfersQueue.length) {
        return;
    }
    let firstItemFromQueue = transfersQueue.splice(0, 1)[0];
    switch (firstItemFromQueue.operationType) {
        case "copy":
        case "move":
            copyOrMoveOperation(firstItemFromQueue.operationType, firstItemFromQueue.dataType, firstItemFromQueue.dataPath, firstItemFromQueue.sourcePath, firstItemFromQueue.targetPath, firstItemFromQueue.dstFS, firstItemFromQueue.filesPanelID);
            break;
        case "delete":
            deleteOperation(firstItemFromQueue.operationType, firstItemFromQueue.dataType, firstItemFromQueue.sourcePath, firstItemFromQueue.targetPath, firstItemFromQueue.filesPanelID);
            break;
        default:
            console.error(`Unknown operation type: ${firstItemFromQueue.operationType}`);
    }
}
function copyOrMoveOperation(operationType, dataType, dataPath, sourcePath, targetPath, dstFS, _filesPanelID) {
    //const panelToUpdate = _filesPanelID === "leftPanelFiles" ? "rightPanelFiles" : "leftPanelFiles";
    if (dataType === "folder") {
        const params = {};
        params["srcFs"] = dataPath;
        params["dstFs"] = dstFS;
        if (operationType === "move") {
            params["deleteEmptySrcDirs"] = true;
        }
        let folderOperation = functions.getFolderOperation(operationType);
        if (folderOperation === "") {
            console.error(`Unknown operation type: ${operationType}`);
        }
        functions.sendRequestToRclone(folderOperation, params, function (_rez) {
            //console.debug("Folder operation result:", rez);
            // if (operationType === "move")
            // {
            //     refreshFilesListing();
            // }
            // else
            // {
            //     openPath(functions.panelsPaths[panelToUpdate], panelToUpdate);
            // }
        });
    }
    else {
        const params = {
            "srcFs": sourcePath,
            "srcRemote": targetPath,
            "dstFs": dstFS,
            "dstRemote": targetPath
        };
        let fileOperation = functions.getFileOperation(operationType);
        if (fileOperation === "") {
            console.error(`Unknown operation type: ${operationType}`);
        }
        functions.sendRequestToRclone(fileOperation, params, function (_rez) {
            //console.debug("File operation result:", rez);
            // if (operationType === "move")
            // {
            //     refreshFilesListing();
            // }
            // else
            // {
            //     openPath(functions.panelsPaths[panelToUpdate], panelToUpdate);
            // }
        });
    }
}
function deleteOperation(operationType, dataType, sourcePath, targetPath, _filesPanelID) {
    let params = {
        "fs": sourcePath,
        "remote": targetPath
    };
    let folderOperation = dataType === "folder"
        ? functions.getFolderOperation(operationType)
        : functions.getFileOperation(operationType);
    if (folderOperation === "") {
        console.error(`Unknown operation type: ${operationType}`);
    }
    // console.debug("Delete:", folderOperation, params);
    functions.sendRequestToRclone(folderOperation, params, function (_rez) {
        //console.debug("Delete result:", rez);
        //openPath(functions.panelsPaths[_filesPanelID], _filesPanelID);
    });
}
