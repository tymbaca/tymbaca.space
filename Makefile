reload:
	npm ci
	npm run build
	sudo systemctl restart tymbaca.space
