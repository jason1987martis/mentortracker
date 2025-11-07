const { createProxy } = require("../lib/createProxy");

module.exports = createProxy({
  targetEnv: "UPLOAD_TARGET_URL",
  allowedMethods: ["POST", "OPTIONS"]
});
