nano .ssh/deploy
chmod 600 ~/.ssh/deploy
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/deploy