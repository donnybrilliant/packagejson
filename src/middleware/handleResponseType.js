function handleResponseType(req, res, next) {
  if (req.accepts("html")) {
    res.type("html"); // Sets the response Content-Type header to 'text/html'
    req.isHtmlRequest = true;
  } else if (req.accepts("json")) {
    res.type("json"); // Sets the response Content-Type header to 'application/json'
    req.isJsonRequest = true;
  } else {
    const error = new Error("Not Acceptable");
    error.status = 406;
    return next(error);
  }
  next();
}

export default handleResponseType;
