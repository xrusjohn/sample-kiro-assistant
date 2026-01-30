# GitLab Deployment Notes

Steps we followed to push Kiro Coworker to `https://gitlab.aws.dev/wwps-asean-sa-genai/Kiro-Cowork`:

1. **Clone / existing repo**
   - Repo started as Agent Coworker fork (GitHub remote). We added the AWS GitLab remote and force-pushed when ready.

2. **Midway-signed SSH key**
   - Generate ECDSA key (`ssh-keygen -t ecdsa`), sign it via `mwinit -k ~/.ssh/id_ecdsa.pub`.
   - Add to `~/.ssh/config`:
     ```
     Host ssh.gitlab.aws.dev
         User git
         IdentityFile ~/.ssh/id_ecdsa
         CertificateFile ~/.ssh/id_ecdsa-cert.pub
         IdentitiesOnly yes
     ```

3. **Git remote**
   - Set origin to the Midway SSH URL:
     ```
     git remote set-url origin ssh://git@ssh.gitlab.aws.dev/wwps-asean-sa-genai/Kiro-Cowork.git
     ```
   - Verify with `git remote -v`.

4. **Protected branch**
   - `main` was protected on GitLab; force pushes were blocked (`pre-receive hook`). We temporarily removed branch protection, force-pushed, then re-enabled protection.

5. **Push sequence**
   - Stage and commit: `git add .` / `git commit -m "..."`.
   - Push: `git push origin main` (or `-f` if overwriting, once protection disabled).

6. **Troubleshooting**
   - If Git still prompts for Github, check `git remote -v`.
   - If GitLab rejects with HTTPS errors, ensure the remote uses `ssh.gitlab.aws.dev`.
   - For connection timeouts to `gitlab.aws.dev:22`, switch to the `ssh.` host and Midway config.
   - To refresh a single file from remote: `git checkout origin/main -- README.md`.
   - To reset everything to remote: `git reset --hard origin/main` (beware: discards local changes).

7. **Staging vs untracked**
   - `git status` shows tracked files (modified) vs untracked. Stage new files (`git add <file>`) before committing or they won’t be pushed.

Keep this guide handy when setting up a new workstation or pushing significant updates to the AWS GitLab mirror.
