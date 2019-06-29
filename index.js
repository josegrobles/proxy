require("dotenv").config();
const fs = require("fs");
const request = require("request-promise-native");
const SQUID_CONFIGURATION_DIR = process.env.SQUID_CONFIGURATION_DIR;
const API_URL = process.env.API_URL;

const getExternalIP = async () => {
  const externalIPRequest = await request({
    uri: "https://api.ipify.org?format=json",
    json: true
  });
  return externalIPRequest.ip;
};

const getPreviousConfigurationRule = configuration =>
  configuration.find(line => /acl user src/.test(line));

const getCurrentConfigurationRule = (configuration, externalIP) => {
  const aclRuleRegex = new RegExp(`^acl user src ${externalIP}/32$`);
  return configuration.find(line => aclRuleRegex.test(line));
};

const createNewConfigurationRule = externalIP =>
  `acl user src ${externalIP}/32`;

const updateInformation = async (email, refreshToken, externalIP) =>
  request({
    uri: API_URL,
    body: {
      email,
      refreshToken,
      externalIP
    },
    method: "POST",
    json: true
  });
const getSquidConfiguration = () =>
  fs.readFileSync(SQUID_CONFIGURATION_DIR, { encoding: "utf-8" }).split("\n");

const getStateInformation = () => require("./state.json");

const saveInformation = ({ sourceIP, refreshToken, externalIP }) => {
  const previousState = require("./state.json");
  const mergedState = { ...previousState, sourceIP, refreshToken, externalIP };
  fs.writeFileSync("./state.json", JSON.stringify(mergedState, null, 2));
};

const main = async () => {
  const state = getStateInformation();
  const { email, refreshToken } = state;
  const externalIP = await getExternalIP();

  const updatedInformation = await updateInformation(
    email,
    refreshToken,
    externalIP
  );
  saveInformation({ ...updatedInformation, externalIP });
  const { sourceIP } = updatedInformation;
  const squidConfiguration = getSquidConfiguration();
  const currentConfigurationRule = getCurrentConfigurationRule(
    squidConfiguration,
    sourceIP
  );
  if (!currentConfigurationRule) {
    const previousConfigurationRule = getPreviousConfigurationRule(
      squidConfiguration
    );
    const newSquidConfiguration = squidConfiguration
      .map(line =>
        line === previousConfigurationRule
          ? createNewConfigurationRule(sourceIP)
          : line
      )
      .join("\n");
    fs.writeFileSync(SQUID_CONFIGURATION_DIR, newSquidConfiguration, {
      encoding: "utf-8"
    });
  }
};

main();
