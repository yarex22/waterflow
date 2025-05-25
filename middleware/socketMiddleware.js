module.exports = (req, res, next) => {
  req.io = req.app.get('io'); // Attach the io instance to the req object
  next();
};