reload:
	npm run build
	sudo systemctl restart tymbaca.space
	sudo systemctl restart tymbaca.space.backend

full:
	npm ci
	npm run build
	sudo systemctl restart tymbaca.space
	sudo systemctl restart tymbaca.space.backend
