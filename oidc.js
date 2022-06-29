const express = require("express");
const crypto = require('crypto');
const { generators, Issuer, TokenSet } = require("openid-client");
const fs = require("fs-extra");
const os = require("os");

const APP_SECRET = crypto.createHash("md5").update(os.hostname(), "binary").digest("hex").slice(0, 32);
const APP_BUFFER_SECRET = crypto.createHash("md5").update(`${os.platform()}${os.arch()}`, "binary").digest("hex").slice(0, 16);
const ENCRYPT_METHOD = 'aes-256-cbc';

/**
 * A class for authentication by Open ID Connect.
 */
class OIDC{
  clientID;
  portNumber;
  issuerBaseURL;
  clientSecret;
  #response_type = null;
  #callbackURL  = "http://localhost:{port}/";
  #authorization_url;
  #auth_params = {};
  #app;
  #server;
  #jwt;
  #id_token;

  /**
   * constructor.
   * @param {String} clientID Client ID
   * @param {Number} portNumber Port number waiting for connection
   * @param {String} issuerBaseURL URL for OIDC connection
   * @param {String} scope A scope showing the data to be acquired. Default value "ppenid email profile"
   */
  constructor(clientID, portNumber, issuerBaseURL, scope="openid email profile"){
    this.clientID = clientID;
    this.portNumber = portNumber;
    this.issuerBaseURL = issuerBaseURL;
    this.scope = scope;
  }

  /**
   * Set up code authentication.
   * @param {String} clientSecret Client secret
   */
  codeAuth(clientSecret){
    this.clientSecret = clientSecret;
    this.#response_type = "code";
  }

//#region Certification processing

  /**
   * Authenticate. You can wait for the server to complete by using the await operator.
   * @param {EventHandler} onAuthenticate An event handler called when the authentication is completed.It should be noted that some patterns are not called, such as when the user closes the authentication page as it is.
   */
  async doAuthenticate(onAuthenticate){
    if(this.#server) this.shutdown();
    const code_verifier = generators.codeVerifier();
    this.#auth_params = {
      state: generators.state(),
      nonce: generators.nonce(),
      code_verifier: code_verifier,
      code_challenge: generators.codeChallenge(code_verifier)
    }
    await this.#createServer(onAuthenticate);
    return undefined;
  }

  /**
   * Shut down the server. You can wait for the server shut down by using the await operator.
   */
  async shutdown(){
    this.#server.close(() => {
      this.#server = undefined;
      return true;
    });
  }

  /**
   * Create a server.You can wait for the server to complete by using the await operator.
   * @param {EventHandler} onAuthenticate An event handler called when the authentication is completed.It should be noted that some patterns are not called, such as when the user closes the authentication page as it is.
   */
  async #createServer(onAuthenticate){
    const app = this.#app = express();
    const issuer = await Issuer.discover(this.issuerBaseURL);
    const client = new issuer.Client(this.#createClientMetadata());
    this.#authorization_url = client.authorizationUrl({
      scope: this.scope,
      state: this.#auth_params.state,
      nonce: this.#auth_params.nonce,
      response_type: this.#response_type,
      code_challenge: this.#auth_params.code_challenge,
      code_challenge_method: "S256",
    });
    const checks = {
      code_verifier: this.#auth_params.code_verifier,
      state: this.#auth_params.state,
      nonce: this.#auth_params.nonce
    }
    app.get('/callback' , async (req , res)=>{
      const params = client.callbackParams(req);
      try {
        const tokenSet = await client.callback(`${this.callbackURL}callback`, params, checks);
        this.#id_token = tokenSet;
        this.#jwt = await client.userinfo(tokenSet.access_token);
        onAuthenticate(this.#jwt, this.#id_token);
        res.status(200);
        res.send("Authentication is complete. Close the browser tab.");
      } catch (error) {
        res.status(401);
        res.send("Authentication failed.");
      }
      res.end();
      await this.shutdown();
    });
    this.#server = app.listen(this.portNumber, async () => {
      console.debug(`Listening on ${this.callbackURL}`);
      return true;
    });
  }

  /**
   * Refresh the access token by refresh token.
   * @param {EventHandler} onAuthenticate An event handler called when the authentication is completed. The value obtained here does not change significantly from the return value of the method.It exists on the created program to make it easier to perform the same process as `doAuthentication`.
   * @returns {TokenSet} Updated token set.
   * @throws Calling this method without authentication or the authentication itself, but the refresh token has not been obtained, causing an exception.
   */
  async refresh(onAuthenticate){
    if(!this.isAuthenticated) throw new Exception("I haven't authenticated yet.");
    if(!this.isCanRefresh) throw new Exception("There is no refresh token.");
    if(this.#server) await this.shutdown();
    const issuer = await Issuer.discover(this.issuerBaseURL);
    const client = new issuer.Client(this.#createClientMetadata());
    this.#id_token = await client.refresh(this.idToken.refresh_token);
    if(onAuthenticate) onAuthenticate(this.JWT, this.idToken);
    return this.#id_token;
  }

  /**
   * Create a ClientMetadata structure for passing to `Issuer.Client()` to summarize various set values.
   * @returns {import("openid-client").ClientMetadata} A structure that summarizes the set value.
   * @throws Exceptions occur if the unsupported response type is specified or if the response type is not specified.
   */
  #createClientMetadata(){
    let cli_params = {
      client_id: this.clientID,
      redirect_uris: [`${this.callbackURL}callback`],
      response_types: []
    }
    switch (this.#response_type) {
      case "code":
        cli_params.client_secret = this.clientSecret;
        cli_params.response_types.push(this.#response_type);
        break;
      default:
        throw new Exception("Unknown responce_type");
    }
    return cli_params;
  }

//#endregion

//#region File I/O
  /**
   * Write the configuration information in the file.The two are written: JWT and IDToken.
   * @param {string} file_name The name of the file to be written
   */
  async saveToFile(file_name){
    const encrypt = (data) => {
      const iv = Buffer.from(APP_BUFFER_SECRET);
      const cipher = crypto.createCipheriv(ENCRYPT_METHOD, Buffer.from(APP_SECRET), iv);
      const encrypted = cipher.update(JSON.stringify(data));
      return Buffer.concat([encrypted, cipher.final()]).toString("hex");
    }
    await fs.writeFile(file_name, JSON.stringify({
      "a": encrypt(this.JWT),
      "b": encrypt(this.idToken),
      "c": this.#check_string
    }));
  }

  /**
   * Read the configuration information from the JSON file.
   * @param {string} file_name File name of the file to be read
   * @returns If the file can be decrypted, True. If there is no file, there is a file, but if the version check string is different and the can't decrypted, return False.
   */
  async loadFromFile(file_name){
    if(!fs.existsSync(file_name)) return false;
    let basedata = JSON.parse(await fs.readFile(file_name));
    if(basedata.c == this.#check_string){
      const decrypt = (text) => {
        const iv = Buffer.from(APP_BUFFER_SECRET);
        const decipher = crypto.createDecipheriv(ENCRYPT_METHOD, Buffer.from(APP_SECRET), iv);
        const encryptedtext = Buffer.from(text, "hex");
        const decrypted = decipher.update(encryptedtext);
        return JSON.parse(Buffer.concat([decrypted, decipher.final()]).toString());
      }
      this.#jwt = decrypt(basedata.a);
      this.#id_token = decrypt(basedata.b);
      return true;
    }else{
      return false;
    }
    
  }

  /**
   * Get the file version check string.
   */
  get #check_string(){
    return Buffer.from(`${APP_BUFFER_SECRET.slice(0, 3)}${APP_SECRET.slice(0, 3)}`).toString("base64")
  }

//#endregion

//#region Properies

  /**
   * Get and set a callback URL
   */
  get callbackURL(){
    return this.#callbackURL.replace("{port}", this.portNumber);
  }
  /**
   * Get and set a callback URL
   */
  set callbackURL(value){
    this.#callbackURL = value;
  }

  /**
   * If the authentication is performed, return True.
   */
  get isAuthenticated(){
    return this.#jwt != undefined;
  }

  /**
   * Returns JSON Web Token, which shows the certified. This property is undefined until the `doAuthentication` method is called.
   */
  get JWT(){
    return this.#jwt;
  }

  /**
   * Returns ID Token, which shows the certified. This property is undefined until the `doAuthentication` method is called.
   */
  get idToken(){
    return this.#id_token;
  }

  /**
   * Return True when the access token can be refreshed by refresh token.
   */
  get isCanRefresh(){
    return this.isAuthenticated && this.idToken.refresh_token;
  }

  /**
   * Obtain an authorization URL. This property is undefined until the `doAuthentication` method is called.
   */
  get authorization_url(){
    return this.#authorization_url;
  }

//#endregion
}

module.exports = OIDC;