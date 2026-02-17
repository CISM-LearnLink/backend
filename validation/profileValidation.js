import Joi from "joi";

export const profileSchema = Joi.object({
  bio: Joi.string().max(1000)
    .pattern(/^[a-zA-Z0-9\s.,!?()-@'"]+$/)
    .required(),

  experience: Joi.string().max(500)
    .pattern(/^[a-zA-Z0-9\s.,!?()-@'"]+$/)
    .required()
});