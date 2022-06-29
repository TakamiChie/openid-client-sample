# openid-client-sample

This repository is a sample that extended electron-quick-start.

See [electron-quick-start's repository](https://github.com/electron/electron-quick-start) for the original use of electron-quick-start and how to start up.

A sample of Open ID Connect authentication using the openid-client module in Electron. In addition to Authorise processing, it also implements stand-alone Refresh.

See [I'll write an article on Zenn at a later date](https://zenn.dev/takamichie) for the usage and function of each.

The [feature-oidc-class branch](https://github.com/TakamiChie/openid-client-sample/tree/feature-oidc-class) shows how to simplify OIDC authentication processing by combining it into classes(Please confirm that the license has changed).

## A simple use case

1. Rename `sample.env` to `.env` and write the configuration of the Open ID Connect service you want to connect to.
2. Run it as it is and click the Authorise button (you can also debug from Visual Studio Code because the debug settings for Visual Studio Code are also filled in).
3. After Authorise, refresh processing is also possible with the Refresh button.

Note that Google's Open ID Connect may not return a refresh token when Authorise (it seems that it does not return if you have already authenticated), so the Refresh button may not be available (even if you use it, you will get an error). 

Github's Open ID Connect seems to exhibit much of a violation of the specification, and openid-client cannot connect.
