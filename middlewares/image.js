const multer = require('multer');

const storage = multer.diskStorage({});

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image')) {
        cb(null, true);
    } else {
        cb('invalid image file!', false);
    }
};

const limits = {
    fileSize: 1024 * 1024 * 1.5
};

const uploads = multer({ storage, limits: limits, fileFilter: fileFilter });
module.exports = uploads;