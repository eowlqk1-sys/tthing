# DreamSecurity MobileOK files

Put DreamSecurity files here without exposing them under the public tthing/ folder.

Required library file:
- dreamsecurity/mok_Key_Manager_v1.0.3.js

Required key files:
- dev_keys/mok_keyInfo.dat
- prod_keys/mok_keyInfo.dat

The key zip password you received from DreamSecurity is only used when extracting the zip. Do not commit passwords or key files to a public repository.

Runtime config:
- Copy .env.example to .env on the server.
- Set DREAM_KEY_PASSWORD to the key-file password.
- Use DREAM_AUTH_MODE=dev for development and DREAM_AUTH_MODE=prod for production.
- For production, set DREAM_AUTH_ENV=prod and DREAM_KEY_PATH=/home/user/tthing/prod_keys/mok_keyInfo.dat.
