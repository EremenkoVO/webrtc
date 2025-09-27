BINARIES_DIR ?= cmd
BUILD_DIR ?= bin
BINARIES := $$(find $(BINARIES_DIR) -maxdepth 1 \( ! -iname "$(BINARIES_DIR)" \) -type d -exec basename {} \;)

COVER_FILE ?= coverage.out
IMPORT_PATH ?= $(shell go list -m -f {{.Path}} | head -1)
RACE_DETECTOR := $(if $(RACE_DETECTOR), -race)

.PHONY: default
default: help

.PHONY: api
api: ## Generate the api from the openapi.yaml file.
	@go tool oapi-codegen --config=./api/cfg.yaml ./api/openapi.yaml

.PHONY: lint
lint: ## Check the project with lint.
	@go tool golangci-lint run -v --fix

.PHONY: test
test: ## Run unit tests
	@go tool gotestsum --format-hide-empty-pkg -f dots-v2 -- -p=1 -count=1 -timeout=1200s $(RACE_DETECTOR) -coverprofile=$(COVER_FILE) -v ./...
	@go tool cover -func=$(COVER_FILE) | grep ^total

.PHONY: cover
cover: $(COVER_FILE) ## Output coverage in human readable form in html
	@go tool cover -html=$(COVER_FILE)
	@rm -f $(COVER_FILE)

.PHONY: mod
mod: ## Manage go mod dependencies, beautify go.mod and go.sum files.
	@go tool go-mod-upgrade
	@go mod tidy

.PHONY: fmt
fmt: ## Format the code.
	@gofmt -w .
	@git status --short | grep '[A|M]' | grep -E -o "[^ ]*$$" | grep '\.go$$' | xargs -I{} go tool goimports -local $(IMPORT_PATH) -w {}

.PHONY: build
build: ## Build binaries.
	for bin in $(BINARIES); do \
		go build -o $(BUILD_DIR)/$$bin $(IMPORT_PATH)/$(BINARIES_DIR)/$$bin || exit; \
	done

.PHONY: help
help: ## Prints this help message
	@echo "Commands:"
	@grep -F -h '##' $(MAKEFILE_LIST) \
		| grep -F -v fgrep \
		| sort \
		| grep -E '^[a-zA-Z_-]+:.*?## .*$$' \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-30s\033[0m %s\n", $$1, $$2}'
