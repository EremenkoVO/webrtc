FROM golang:1.25.1-alpine AS build

# 1. Precompile the entire go standard library into the first Docker cache layer: useful for other projects too!
RUN --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go install -v -installsuffix cgo -a std

WORKDIR /src

# 2. Download and precompile all third party libraries, ignoring errors (some have broken tests or whatever).
# See issues https://github.com/golang/go/issues/27719.
# Also reusing previous go build cache by `--mount`.
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go mod graph | awk '$1 !~ /@/ ' | xargs -r go get -x && \
    go list -m -f '{{ if not .Main }}{{ .Path }}/...@{{ .Version }}{{ end }}' all | tail -n +2 | \
    CGO_ENABLED=0 GOOS=linux xargs go build -v -installsuffix cgo -i; echo done

COPY . .

# 3. Compile! Should only compile our sources since everything else is precompiled.
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -v -installsuffix cgo -o ./bin/api -ldflags "-s -w" ./cmd/api

# Create the user and group files that will be used in the running container to
# run the process as an unprivileged user.
RUN mkdir /user \
    && echo '1000:x:65534:65534:1000:/:' > /user/passwd \
    && echo '1000:x:65534:' > /user/group

RUN mkdir /data

# Final stage: the running container.
FROM scratch

# Import the user and group files from the build stage.
COPY --from=build /user/group /user/passwd /etc/
# Import the Certificate-Authority certificates for enabling HTTPS.
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Import binaries to final stage.
COPY --from=build /src/bin/api /bin/api

COPY --from=build /data /data

EXPOSE 8080
EXPOSE 8081
USER 1000

ENTRYPOINT [ "/bin/api" ]
