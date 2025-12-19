import { panelsPaths, debounce } from "./functions.js";
export function showSearch(btn, filesPanelID) {
    if (panelsPaths[filesPanelID] === "") {
        alert("Nothing to search in, choose a remote first.");
        return;
    }
    const panelDiv = btn.parentNode.parentNode.parentNode;
    panelDiv.querySelector(".controls").style.display = "none";
    const searchBlock = panelDiv.querySelector(".input-query.search");
    searchBlock.style.display = "flex";
    searchBlock.querySelector("input").focus();
}
export function hideSearch(btn, filesPanelID) {
    let panelDiv = btn.parentNode.parentNode;
    panelDiv.querySelector(".input-query.search").style.display = "none";
    panelDiv.querySelector(".controls").style.display = "flex";
    clearSearch(filesPanelID);
}
function clearSearch(filesPanelID) {
    const fileLines = Array.from(document.getElementById(filesPanelID)
        .querySelectorAll(".file-list-item > .fileLine"));
    for (let i = 0; i < fileLines.length; i++) {
        fileLines[i].parentNode.style.display = "flex";
    }
}
export const searchQueryChanged = debounce((searchTerm, filesPanelID) => {
    clearSearch(filesPanelID);
    // don't start search until there are at least 3 symbols
    if (searchTerm.length < 3) {
        if (searchTerm.length !== 0) {
            console.warn("The search query is too short");
        }
        return;
    }
    //console.debug(`Searching for [${searchTerm}]...`);
    const fileLines = Array.from(document.getElementById(filesPanelID)
        .querySelectorAll(".file-list-item > .fileLine"));
    for (let i = 0; i < fileLines.length; i++) {
        if (!fileLines[i].querySelector("p")
            .textContent.toLowerCase().includes(searchTerm.toLowerCase())) {
            fileLines[i].parentNode.style.display = "none";
        }
    }
}, 200);
