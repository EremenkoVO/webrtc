FROM golang:1.25.1-alpine AS build

RUN apk --no-cache add gcc musl-dev

WORKDIR /src

COPY . .

# 3. Compile! Should only compile our sources since everything else is precompiled.
RUN CGO_ENABLED=1 GOOS=linux go build -o ./bin/api ./cmd/api

# Final stage: the running container.
FROM alpine:latest

RUN apk --no-cache add ca-certificates

RUN adduser -D -u 1000 appuser

RUN mkdir -p /app/data /app/uploads && chown -R 1000:1000 /app/data /app/uploads

# Import binaries to final stage.
COPY --from=build /src/bin/api /bin/api

EXPOSE 8080 8081
USER 1000

ENTRYPOINT [ "/bin/api" ]
