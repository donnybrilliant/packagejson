/**
 * Middleware function that handles the response type based on the Accept header of the HTTP request.
 * @module handleResponseType
 * @param {object} req - Express.js request object
 * @param {object} res - Express.js response object
 * @param {function} next - Express.js function to pass control to the next middleware
 */
function handleResponseType(req, res, next) {
  // If the request accepts html, set the response Content-Type to text/html and assign true to req.isHtmlRequest
  if (req.accepts("html")) {
    res.type("html");
    req.isHtmlRequest = true;
  }
  // If the request accepts json, set the response Content-Type to application/json and assign true to req.isJsonRequest
  else if (req.accepts("json")) {
    res.type("json");
    req.isJsonRequest = true;
  }
  // If the request does not accept either html or json, set the status to 406 and pass an Error with message "Not Acceptable" to the next middleware
  else {
    const error = new Error("Not Acceptable");
    error.status = 406;
    return next(error);
  }
  next();
}

export default handleResponseType;
