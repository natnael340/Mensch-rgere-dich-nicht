const jwt = require("jsonwebtoken");
const { SECRET_KEY, EXPIRE_MINUTES } = require("../constants");

/**
 * Create a JWT token for a player
 * @param {string} playerId - The player's ID
 * @param {string} name - The player's name
 * @returns {string} JWT token
 */
function createToken(playerId, name) {
  const payload = {
    sub: playerId,
    name,
    exp: Math.floor(Date.now() / 1000) + EXPIRE_MINUTES * 60,
  };
  return jwt.sign(payload, SECRET_KEY);
}

/**
 * Verify and decode a JWT token
 * @param {string} token - JWT token
 * @returns {Object|null} Decoded payload or null if invalid
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET_KEY);
  } catch (error) {
    return null;
  }
}

module.exports = {
  createToken,
  verifyToken,
};
