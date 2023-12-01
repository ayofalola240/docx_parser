const mongoose = require('mongoose');
const app = require('./index');

const start = async () => {
  const PORT = process.env.PORT || 3000;
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/QB';
  try {
    await mongoose.connect(MONGO_URI);

    console.log('Established connection to DB');

    app.listen(PORT, () => console.log('Server is running on Port ', PORT));
  } catch (err) {
    console.error(err);
  }
};

start();
