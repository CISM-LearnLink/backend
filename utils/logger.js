const { createLogger, format, transports } = require("winston");
const crypto = require("crypto");

/*
  Generate SHA-256 hash for log integrity
*/
function generateLogHash(logData) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(logData))
    .digest("hex");
}

/*
  Custom format to automatically attach integrity hash
*/
const addIntegrityHash = format((info) => {
  const logClone = { ...info };
  delete logClone.integrityHash; // avoid recursive hashing
  info.integrityHash = generateLogHash(logClone);
  return info;
});

const logger = createLogger({
  level: "info",
  format: format.combine(
    format.timestamp(),
    addIntegrityHash(), //Integrity protection added
    format.json(),
  ),
  transports: [
    new transports.File({ filename: "logs/error.log", level: "error" }),
    new transports.File({ filename: "logs/combined.log" }),
  ],
});

module.exports = logger;
