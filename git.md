# Fork Repository Sync Guide

이 프로젝트는 `chrisryugj/korean-law-mcp` 원본 repository를 fork한 repository입니다.

내 fork가 원본보다 뒤처졌다는 메시지가 보이면, 원본 repository의 최신 변경 사항을 내 fork와 로컬 repository에 반영해야 합니다.

예시 메시지:

```text
This branch is 21 commits behind chrisryugj/korean-law-mcp:main.
```

이 메시지는 내 fork의 `main` 브랜치가 원본 repository의 `main` 브랜치보다 21개 커밋 뒤처져 있다는 뜻입니다.

## Remote 구조

- `origin`: 내 fork repository
- `upstream`: 원본 repository

현재 이 로컬 repository의 `origin`은 내 fork를 가리킵니다.

```bash
git remote -v
```

예상 형태:

```text
origin    git@github.com:dongjunson/korean-law-mcp.git (fetch)
origin    git@github.com:dongjunson/korean-law-mcp.git (push)
```

## 처음 한 번만 할 일

원본 repository를 `upstream` remote로 추가합니다.

```bash
git remote add upstream git@github.com:chrisryugj/korean-law-mcp.git
git fetch upstream
```

`upstream`이 이미 추가되어 있다면 `git remote add upstream ...` 명령은 다시 실행하지 않아도 됩니다.

## 원본 업데이트 가져오기

원본 repository가 업데이트되었을 때마다 아래 순서로 실행합니다.

```bash
git switch main
git status
git fetch upstream
git merge --ff-only upstream/main
git push origin main
```

각 명령의 의미:

- `git switch main`: 로컬 `main` 브랜치로 이동
- `git status`: 작업 중인 변경 사항이 있는지 확인
- `git fetch upstream`: 원본 repository의 최신 변경 사항을 가져오기
- `git merge --ff-only upstream/main`: 로컬 `main`을 원본 `main`과 동일한 위치로 이동
- `git push origin main`: 내 GitHub fork에도 최신 변경 사항 반영

## 이미 upstream이 등록되어 있는 경우

처음 한 번의 설정이 끝난 상태라면 이후에는 아래 명령만 실행하면 됩니다.

```bash
git fetch upstream
git switch main
git merge --ff-only upstream/main
git push origin main
```

## --ff-only에서 실패하는 경우

`git merge --ff-only upstream/main` 명령이 실패하면, 내 로컬 `main`에도 원본에 없는 별도 커밋이 있다는 뜻입니다.

이 경우에는 일반 merge를 사용합니다.

```bash
git merge upstream/main
```

충돌이 발생하면 충돌 파일을 수정한 뒤 아래처럼 마무리합니다.

```bash
git add .
git commit
git push origin main
```

## GitHub 웹에서 처리하는 방법

GitHub의 fork repository 페이지에서도 처리할 수 있습니다.

```text
Sync fork -> Update branch
```

다만 GitHub 웹에서 fork를 업데이트한 뒤에는 로컬 repository도 다시 최신화해야 합니다.

```bash
git pull origin main
```

