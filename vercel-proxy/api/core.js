const { createProxy } = require("../lib/createProxy");

module.exports = createProxy({
  targetEnv: "CORE_TARGET_URL",
  allowedMethods: ["GET", "POST", "OPTIONS"]
});
