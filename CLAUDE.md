# FDC Skills VS Code Extension

## 작업 규칙

- **단위 작업이 끝날 때마다 반드시 자동으로 git commit 한다.** 커밋 메시지는 변경 내용을 간결하게 한국어로 작성한다.
- 커밋 전에 `npx tsc --noEmit`으로 빌드 에러가 없는지 확인한다.
- 커밋은 `git add -A && git commit -m "메시지"` 형태로 수행한다.

## 빌드 & 설치

### 사전 요구사항

- Node.js 22.x
- npm
- `vsce` (npx로 자동 사용됨)

### 빌드 (VSIX 패키징)

```bash
npm run package
```

이 명령은 다음을 순서대로 수행합니다:

1. `npm version patch --no-git-tag-version` — `package.json`의 버전 마지막 자리를 +1 증가 (예: 0.0.6 → 0.0.7), git 태그/커밋 없음
2. `npx vsce package --allow-missing-repository` — TypeScript 컴파일 후 `.vsix` 파일 생성 (node_modules 의존성 포함)

결과물: 프로젝트 루트에 `fdc-skills-x.x.x.vsix` 파일 생성

### VS Code에 설치

```bash
code --install-extension fdc-skills-x.x.x.vsix --force
```

설치 후 `Ctrl+Shift+P` → `Developer: Reload Window`로 리로드 필요.

### 주의사항

- VSIX 패키징 시 `--no-dependencies` 옵션을 사용하면 안 됨. `@octokit/rest` 등 런타임 의존성이 누락되어 익스텐션 활성화가 실패함.
- `npm run compile` 만으로는 `.vsix` 파일이 생성되지 않음. 반드시 `npm run package` 사용.
