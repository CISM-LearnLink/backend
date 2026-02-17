import Joi from "joi";

export const reviewSchema = Joi.object({
  text: Joi.string().max(500)
    .pattern(/^[a-zA-Z0-9\s.,!?()-@'"]+$/)
    .required(),

  rating: Joi.number().min(1).max(5).required()
});
