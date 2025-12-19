export const rcloneSettings = {
    host: "http://omv.local:5572",
    // null if --rc-no-auth, otherwise what is set in --rc-user
    user: "rcloneadmin",
    // null if --rc-no-auth, otherwise what is set in --rc-pass
    pass: "typer",
    // null if there is no login_token in URL query parameters,
    // otherwise is set from there and takes over user/pass
    loginToken: null
};
export const remotes = {
    "someExampleRemote": {
        "startingFolder": "path/to/some/path/there",
        "canQueryDisk": true,
        "pathToQueryDisk": ""
    }
};
export const userSettings = {
    timerRefreshEnabled: true,
    timerRefreshView: 2, // seconds
    timerRefreshViewInterval: undefined,
    timerProcessQueue: 5, // seconds
    timerProcessQueueInterval: undefined
};
