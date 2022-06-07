ENV = NODE_ENV=test
BIN = ./node_modules/.bin
TESTS = test/*.test.ts

lint:
	@echo "Linting..."
	@$(BIN)/eslint . --fix
test: lint
	@echo "Testing..."
	@$(ENV) $(BIN)/jest $(TESTS) --detectOpenHandles
watch:
	@echo "Watching changes and testing..."
	@$(ENV) $(BIN)/jest --watch --detectOpenHandles

.PHONY: lint test watch
