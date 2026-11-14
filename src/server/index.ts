import express, { type NextFunction, type Request, type Response } from "express";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ApodError, fetchApod } from "./apod.ts";

const app = express();
const projectRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

app.disable("x-powered-by");

app.get("/api/apod", async (request, response, next) => {
  const date = request.query.date;
  if (typeof date !== "string") {
    response.status(400).json({ error: "Informe uma data válida." });
    return;
  }

  try {
    const apod = await fetchApod(date);
    response.setHeader("Cache-Control", "no-store");
    response.json(apod);
  } catch (error) {
    next(error);
  }
});

app.use(express.static(resolve(projectRoot, "dist")));

app.use(
  (
    error: unknown,
    _request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    if (error instanceof ApodError) {
      response.status(error.statusCode).json({ error: error.message });
      return;
    }

    console.error(
      "Unexpected server error:",
      error instanceof Error ? error.name : "UnknownError",
    );
    response
      .status(500)
      .json({ error: "Não foi possível carregar a imagem do dia." });
  },
);

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT deve ser um número entre 1 e 65535.");
}

app.listen(port, "0.0.0.0", () => {
  console.log(`Servidor disponível na porta ${port}.`);
});
