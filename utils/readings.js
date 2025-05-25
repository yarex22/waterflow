const Reading = require('../models/waterflow/reading/ReadingModel');

exports.calculateAverageConsumption = async (connectionId, months = 3) => {
  const readings = await Reading.find({
    connectionId,
    date: {
      $gte: new Date(new Date().setMonth(new Date().getMonth() - months))
    }
  }).sort({ date: -1 });

  if (!readings.length) return 0;

  const totalConsumption = readings.reduce((sum, reading) => sum + reading.consumption, 0);
  return totalConsumption / readings.length;
}; 