function indexRoutes(app) {
  app.get("/", (req, res) => {
    res.send(`
          <a href="/package.json">package.json</a><br>
          <a href="/repos">repos</a>
        `);
  });
}

export default indexRoutes;
