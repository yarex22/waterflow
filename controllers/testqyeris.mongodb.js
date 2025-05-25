// Select the database to use.
use("test");

// db.users.find()
const code = "64c518a7f26ad19c2c238710";
db.transaction.find({
  "user.partnerUser._id": code,
});
