// Runs once on first MongoDB data volume init (docker-entrypoint-initdb.d).
// Requires MONGODB_APP_USER and MONGODB_APP_PASSWORD on the mongodb service.

const appUser = process.env.MONGODB_APP_USER || 'kanboard_app';
const appPassword = process.env.MONGODB_APP_PASSWORD;

if (appPassword == null || String(appPassword).length < 8) {
  print('ERROR: MONGODB_APP_PASSWORD must be set (min 8 characters) for application user creation');
  quit(1);
}

db = db.getSiblingDB('kanboard');
db.createUser({
  user: appUser,
  pwd: appPassword,
  roles: [{ role: 'readWrite', db: 'kanboard' }],
});
print(`Created application user "${appUser}" on database kanboard`);
