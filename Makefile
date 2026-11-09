reload:
	npm run build
	sudo systemctl restart tymbaca.space

full:
	npm ci
	npm run build
	sudo systemctl restart tymbaca.space
