// Environment constants
const MAXIMUM_ALLOWED_PLAYERS = 4;

// JWT constants
const SECRET_KEY = "super-secret"; // change for prod
const ALGORITHM = "HS256";
const EXPIRE_MINUTES = 60 * 24; // 1 day

module.exports = {
  MAXIMUM_ALLOWED_PLAYERS,
  SECRET_KEY,
  ALGORITHM,
  EXPIRE_MINUTES,
};
