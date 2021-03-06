import { Request, Response } from "express";

import { app } from "../../";
import logger from "../../utilities/Logger";
import { DatabaseResultSet, query } from "../../db/database-query";

import {
    CreateAccount,
    CreateAccountCallBack,
    CreateAccountResponseTypes
} from "../../../../cshub-shared/src/api-calls";
import { validateMultipleInputs } from "../../utilities/StringUtils";
import { hashPassword } from "../../auth/HashPassword";
import { sendVerificationEmail } from "../../utilities/MailConnection";

app.post(CreateAccount.getURL, (req: Request, res: Response) => {
    const createAccountRequest: CreateAccount = req.body as CreateAccount;

    // Here a custom validator validates our input based on a few arguments (some are implied, see the validator). Then it gets back an object, of which we only use the valid field. We could also handle some errors more gracefully, which more logging
    const inputsValidation = validateMultipleInputs(
        {
            input: createAccountRequest.password,
            validationObject: {
                minlength: 8
            }
        },
        {
            input: createAccountRequest.email,
            validationObject: {
                tuemail: true
            }
        },
        {
            input: createAccountRequest.firstname,
            validationObject: {
                minlength: 2,
                maxlength: 127
            }
        },
        {
            input: createAccountRequest.lastname,
            validationObject: {
                minlength: 2,
                maxlength: 127
            }
        }
    );

    if (inputsValidation.valid) {
        query(
            `
            SELECT id
            FROM users
            WHERE email = ? AND domainId = ?
            `,
            createAccountRequest.email,
            createAccountRequest.domain.id
        )
            .then((result: DatabaseResultSet) => {
                // It checks whether the user doesn't already exist. If not, hash the password 45000 times and insert the user into the database. If nothing gives any errors, send the callback with a succes message, otherwise it will give the corresponding message
                if (result.getRows().length === 0) {
                    hashPassword(createAccountRequest.password)
                        .then((hashedValue: string) => {
                            query(
                                `
                            INSERT INTO users
                            SET email = ?, password = ?, firstname = ?, lastname = ?, domainId = ?
                            `,
                                createAccountRequest.email,
                                hashedValue,
                                createAccountRequest.firstname,
                                createAccountRequest.lastname,
                                createAccountRequest.domain.id
                            )
                                .then((result: DatabaseResultSet) => {
                                    sendVerificationEmail(
                                        createAccountRequest.email,
                                        createAccountRequest.firstname,
                                        result.getInsertId()
                                    );
                                    res.status(201).json(new CreateAccountCallBack(CreateAccountResponseTypes.SUCCESS));
                                })
                                .catch(err => {
                                    logger.error(`Inserting into users table failed`);
                                    logger.error(err);
                                    res.status(500).send();
                                });
                        })
                        .catch(err => {
                            logger.error(`Hashing password for creating account failed`);
                            logger.error(err);
                            res.status(500).send();
                        });
                } else {
                    res.json(new CreateAccountCallBack(CreateAccountResponseTypes.ALREADYEXISTS));
                }
            })
            .catch(err => {
                logger.error(`Selecting from users failed`);
                logger.error(err);
                res.status(500).send();
            });
    } else {
        res.status(400).json(new CreateAccountCallBack(CreateAccountResponseTypes.INVALIDINPUT));
    }
});
