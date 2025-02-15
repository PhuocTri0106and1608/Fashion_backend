const User = require('../models/User');
const VerificationToken = require('../models/VerificationToken');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const BadRequestError = require('../errors/badRequestError');
const passwordValidator = require('password-validator');
const { generateOTP, mailTransport, OtpTemplate, verifiedTemplate } = require('../utils/mail');
const { isValidObjectId } = require('mongoose');
const NotFoundError = require('../errors/notFoundError');
const { createCart } = require('./cartController');
const InternalServerError = require('../errors/internalServerError');
const { initAddress } = require('./addressController');


// init password validator
let passwordSchema = new passwordValidator();

// Add properties to it
passwordSchema
.is().min(8)                                    // Minimum length 8
.is().max(100)                                  // Maximum length 100
.has().uppercase()                              // Must have uppercase letters
.has().lowercase()                              // Must have lowercase letters
.has().not().spaces();                          // Should not have spaces

// controller action

module.exports.signup_post = async (req, res) => {
    const { email, password, firstName, lastName, phoneNumber } = req.body;

    try {
        // validate password
        const validateResult = passwordSchema.validate(password, { details: true });
        if (validateResult.length != 0) {
            throw new BadRequestError(validateResult);
        }
        // new user create
        const newUser = new User({
            email, 
            password, 
            firstName, 
            lastName, 
            phoneNumber
        })

        // create cart
        const cart = createCart(newUser._id);
        if (!cart) throw new InternalServerError("Something goes wrong while create cart, please try again");

        // init user address
        const address = initAddress(newUser._id);
        if (!address) throw new InternalServerError("Something goes wrong while init address, please try again");
        // generate verification otp
        const OTP = generateOTP();
        const newVerificationToken = new VerificationToken({
            owner: newUser._id,
            token: OTP
        });
        // save the otp and user to db
        const verificationToken = await newVerificationToken.save();
        const user = await newUser.save();
        
        // send a mail that contain otp to the user's email
        mailTransport().sendMail({
            from: 'fashionapp5@gmail.com',
            to: newUser.email,
            subject: 'Verify your email account',
                html: OtpTemplate(OTP),
        });

        res.status(201).json({ 'success': true,'message': `New user ${user} created!` });
    }
    catch (err) {
        if (err.code === 11000) throw new BadRequestError({"message": "This email has already been registered"})
        throw err;
    }
};

exports.verifyEmail = async (req, res) => {
    const { userId, otp } = req.body;
    console.log(otp);
    if (!userId || !otp.trim()) throw new BadRequestError('opt and userId required!');

    if( !isValidObjectId(userId) ) throw new BadRequestError('invalid userId!');

    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User not found!');

    if (user.emailVerified) throw new BadRequestError('This email is already verified!');

    const token = await VerificationToken.findOne({owner: user._id});

    if (!token) throw new NotFoundError('User not found!');

    const isMatched = await token.compareToken(otp);
    if(!isMatched) throw new BadRequestError('Please provide a valid OTP!');

    user.emailVerified = true;

    await VerificationToken.findByIdAndDelete(token._id);
    await user.save();

    mailTransport().sendMail({
        from: 'fashionapp5@gmail.com',
        to: user.email,
        subject: 'Verify your email account success',
        html: verifiedTemplate(),
    });

    res.status(200).json({"Status": "Success"});
};