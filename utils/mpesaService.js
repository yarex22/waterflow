require("dotenv").config();
const axios = require("axios").default;
const crypto = require("crypto");
const constants = require("constants");

let mpesaConfig;

function _getBearerToken(mpesa_public_key, mpesa_api_key) {
  const publicKey =
    "-----BEGIN PUBLIC KEY-----\n" +
    mpesa_public_key +
    "\n" +
    "-----END PUBLIC KEY-----";
  const buffer = Buffer.from(mpesa_api_key);
  const encrypted = crypto.publicEncrypt(
    {
      key: publicKey,
      padding: constants.RSA_PKCS1_PADDING,
    },
    buffer
  );
  return encrypted.toString("base64");
}

function initializeMpesaService() {
  if (!mpesaConfig) {
    mpesaConfig = {
      baseUrl: process.env.MPESA_API_HOST,
      apiKey: process.env.MPESA_API_KEY,
      publicKey: process.env.MPESA_PUBLIC_KEY,
      origin: process.env.MPESA_ORIGIN,
      serviceProviderCode: process.env.MPESA_SERVICE_PROVIDER_CODE,
    };
    validateConfig(mpesaConfig);
    console.log("Using M-Pesa environment configuration");
  } else {
    console.log("Using custom M-Pesa configuration");
  }
}

function requiredConfigArg(argName) {
  return (
    "Please provide a valid " +
    argName +
    " in the configuration when calling initializeMpesaService()"
  );
}

function validateConfig(configParams) {
  if (!configParams.baseUrl) {
    throw requiredConfigArg("baseUrl");
  }
  if (!configParams.apiKey) {
    throw requiredConfigArg("apiKey");
  }
  if (!configParams.publicKey) {
    throw requiredConfigArg("publicKey");
  }
  if (!configParams.origin) {
    throw requiredConfigArg("origin");
  }
  if (!configParams.serviceProviderCode) {
    throw requiredConfigArg("serviceProviderCode");
  }
}

function initiateC2BPayment(amount, msisdn, transaction_ref, thirdparty_ref) {
  initializeMpesaService();
  return axios({
    method: "post",
    url:
      "https://" +
      mpesaConfig.baseUrl +
      ":18352/ipg/v1x/c2bPayment/singleStage/",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Bearer " + _getBearerToken(mpesaConfig.publicKey, mpesaConfig.apiKey),
      Origin: mpesaConfig.origin,
    },
    data: {
      input_TransactionReference: transaction_ref,
      input_CustomerMSISDN: msisdn + "",
      input_Amount: amount + "",
      input_ThirdPartyReference: thirdparty_ref,
      input_ServiceProviderCode: mpesaConfig.serviceProviderCode + "",
    },
  });
}

function initiateB2CPayment(amount, msisdn, transaction_ref, thirdparty_ref) {
  initializeMpesaService();
  return axios({
    method: "post",
    url: "https://" + mpesaConfig.baseUrl + ":18345/ipg/v1x/b2cPayment/",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Bearer " + _getBearerToken(mpesaConfig.publicKey, mpesaConfig.apiKey),
      Origin: mpesaConfig.origin,
    },
    data: {
      input_TransactionReference: transaction_ref,
      input_CustomerMSISDN: msisdn + "",
      input_Amount: amount + "",
      input_ThirdPartyReference: thirdparty_ref,
      input_ServiceProviderCode: mpesaConfig.serviceProviderCode + "",
    },
  });
}

// Export the functions to be used in your routes
module.exports = {
  initiateC2BPayment,
  initiateB2CPayment,
};
