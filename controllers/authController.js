const User = require('../models/User');
const jwt = require('jsonwebtoken');
const BadRequestError = require('../errors/badRequestError');
const ForbiddenError = require('../errors/forbiddenError');
const NotFoundError = require('../errors/notFoundError');
const ResetToken = require('../models/ResetToken');

const { createRandomBytes } = require('../utils/helper');
const { mailTransport, forgetPasswordTemplate, passwordResetTemplate } = require('../utils/mail');
const passwordValidator = require('password-validator');

let passwordSchema = new passwordValidator();

// handle errors
const handleErrors = (err) => {
    console.log(err.message, err.code);
    let errors = { email: '', password: '', firstName: '', lastName: '', phoneNumber: '' };

    // incorrect email
    if (err.message === 'incorrect email') {
        errors.email = 'That email is not registered';
    }

    // incorrect password
    if (err.message === 'incorrect password') {
        errors.password = 'That password is incorrect';
    }

    // validation errors
    if (err.message.includes('user validation failed')) {
        Object.values(err.errors).forEach(({ properties }) => {
        errors[properties.path] = properties.message;
        });
    }

    return errors;
};

// define max age of JWT
const maxAgeAccessToken = 60 * 60;
const maxAgeRefreshToken = 60 * 60 * 24 * 30 * 6;

module.exports.login_post = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.login(email, password);
        // create JWTs for logged in user.
        const accessToken = jwt.sign(
            {
                "userInfo": {
                    "userId": user._id,
                }
            },
            process.env.ACCESS_TOKEN_SECRET,
            { expiresIn: maxAgeAccessToken }
        );
        const refreshToken = jwt.sign(
            { "userId": user._id },
            process.env.REFRESH_TOKEN_SECRET,
            { expiresIn: maxAgeRefreshToken }
        );

        // set new refresh token
        user.refreshToken = refreshToken;
        const result = await user.save();
        console.log("login success: ", result);
        
        // Creates Secure Cookie with refresh token
        res.cookie('jwt', refreshToken, { httpOnly: true, secure: false, sameSite: 'None', maxAge: maxAgeRefreshToken * 1000 });

        // delete refresh token and password from user info
        user.refreshToken = undefined;
        user.password = undefined;

        // Send authorization roles and access token to user
        res.json({ accessToken, user });
    }
    catch (err) {
        throw err;
    }
};

module.exports.logout_post = async (req, res) => {
    // check if cookies exist
    const cookies = req.cookies;
    if (!cookies?.jwt) return res.sendStatus(204); //no token == no need handle

    // check if jwt belong to any user
    const refreshToken = cookies.jwt;
    const foundUser = await User.findOne({ refreshToken }).exec();
    if (!foundUser) {
        res.clearCookie('jwt', { httpOnly: true, sameSite: 'None', secure: true });
        return res.sendStatus(204);
    }

    // clear refreshToken when logout
    foundUser.refreshToken = '';
    const result = await foundUser.save();

    res.clearCookie('jwt', { httpOnly: true, sameSite: 'None', secure: true });
    res.sendStatus(204);
};

module.exports.forget_password = async (req, res) => {
    const { email } = req.body;
    if(!email) throw new BadRequestError("Please provide a valid email!");

    const user = await User.findOne({ email });
    if (!user) throw new NotFoundError("User not found, invalid request");

    const token = await ResetToken.findOne({owner: user._id});
    if (token) throw new ForbiddenError("Only after one hour you can request for another token!");

    const newToken = await createRandomBytes();
    const resetToken = new ResetToken({
        owner: user._id,
        token: newToken
    });

    const result = await resetToken.save();

    mailTransport().sendMail({
        from: 'fashionapp5@gmail.com',
        to: user.email,
        subject: 'Password Reset',
        html: forgetPasswordTemplate(`http://localhost:3000/reset-password?token=${newToken}&id=${user._id}`),
    });

    res.status(200).json({"Status": "Success", "message": "Password reset link is sent to your email"});
};

passwordSchema
.is().min(8)                                    // Minimum length 8
.is().max(100)                                  // Maximum length 100
.has().uppercase()                              // Must have uppercase letters
.has().lowercase()                              // Must have lowercase letters
.has().not().spaces(); 

module.exports.reset_password = async (req, res) => {
    try {
        const { password } = req.body;
        console.log(password);
    
    const user = await User.findById(req.user._id);
    if (!user) throw new NotFoundError("User not found!");
    
    const isSamePassword = await user.comparePassword(password);
    if(isSamePassword) throw new BadRequestError("New password must be different from the old one!");
    
    // validate password
    const validateResult = passwordSchema.validate(password.trim(), { details: true });
    if (validateResult.length != 0) {
        throw new BadRequestError(validateResult);
    }
    
    user.password = password.trim();
    await user.save();
    
    await ResetToken.findOneAndDelete({owner: user._id});
    
    mailTransport().sendMail({
        from: 'fashionapp5@gmail.com',
        to: user.email,
        subject: 'Password Reset Successfully',
        html: passwordResetTemplate(),
    });
    
    res.json({Status: "Success", message: "Password Reset Successfully"}); 
    }
    catch (err) { 
        throw err 
    }
};
