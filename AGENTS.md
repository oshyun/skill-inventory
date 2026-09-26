# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 작업 규칙

- **단위 작업이 끝날 때마다 반드시 자동으로 git commit 한다.** 커밋 메시지는 변경 내용을 간결하게 한국어로 작성한다.
- 커밋 전에 `npx tsc --noEmit`으로 빌드 에러가 없는지 확인한다.
- 커밋은 `git add -A && git commit -m "메시지"` 형태로 수행한다.

## 주요 명령어

```bash
# TypeScript 타입 검사 (빌드 없이)
npx tsc --noEmit

# TypeScript 컴파일
npm run compile

# 린트
npm run lint

# 테스트 실행
npm test

# VSIX 패키징만
npm run package
# 또는
./build.sh

# VSIX 패키징 + VS Code 자동 설치
npm run package:install
# 또는
./build.sh --install
```

## 빌드 & 설치

`build.sh`는 다음을 순서대로 수행:
1. `node scripts/bump-version.js` — git 커밋 수 기반으로 `package.json` 버전 자동 설정
2. `npx vsce package --allow-missing-repository` — TypeScript 컴파일 후 `.vsix` 생성
3. `git restore package.json` — 버전이 반영된 `package.json` 원복
4. `--install` 파라미터가 있으면 최신 `.vsix`를 VS Code에 자동 설치

결과물: 프로젝트 루트에 `skill-inventory-x.x.x.vsix` 파일 생성

### 주의사항

- VSIX 패키징 시 `--no-dependencies` 옵션 금지 — `@octokit/rest` 런타임 의존성 누락으로 활성화 실패
- `npm run compile` 만으로는 `.vsix` 미생성, 반드시 `npm run package` 사용
- 설치 후 `Ctrl+Shift+P` → `Developer: Reload Window` 리로드 필요

## 마켓플레이스 게시 (배포)

로컬 `.vsix` 설치 외에, VS Code Marketplace에 게시(배포)할 수 있다. 게시 관리 페이지:

- https://marketplace.visualstudio.com/manage/publishers

`package.json`의 `publisher`는 `oshyun` 이며, Marketplace의 publisher ID와 일치해야 한다.

### 게시 절차

1. **Publisher 생성**: 위 관리 페이지에서 publisher(`oshyun`)를 만든다. (최초 1회)
2. **Azure DevOps PAT 발급**: `Marketplace > Manage` 스코프의 Personal Access Token을 발급받는다. (Marketplace 게시는 Azure DevOps PAT로 인증한다)
3. **게시** — 두 가지 방법 중 택1:
   - **CLI**: `npx vsce login oshyun` (PAT 입력) 후 `npx vsce publish`
   - **수동 업로드**: 관리 페이지에서 `npm run package`로 만든 `.vsix` 파일을 직접 업로드

### 주의사항

- `npm run package`(=`scripts/build.sh`)는 마지막에 `git restore package.json`으로 버전 반영분을 원복하므로, `vsce publish`로 버전 자동 증가를 쓰려면 별도 절차가 필요하다. 가장 단순한 방법은 `.vsix`를 만들어 관리 페이지에 **수동 업로드**하는 것이다.
- Marketplace 게시용 PAT(Azure DevOps)는 소스 동기화용 GitHub PAT(`skillInventory.source`)와 완전히 별개다.

## 아키텍처

Skill Inventory는 Git 저장소에서 스킬을 불러와 VS Code의 Activity Bar에 트리 뷰로 표시하고, 로컬 워크스페이스의 `target` 경로들(기본값: `.claude/skills`, `~/.claude/skills`)에 동기화하는 VS Code 익스텐션이다.

### 소스 구조

```
src/
├── extension.ts              # 익스텐션 진입점 — activate/deactivate, 폴링 루프
├── models/skill.ts           # 데이터 모델 (Skill, TreeNode 타입) 및 markdown 파싱/직렬화 유틸
├── services/
│   ├── githubService.ts      # Octokit 기반 GitHub API 클라이언트 (트리 탐색, 파일 다운로드)
│   └── copilotService.ts     # 로컬 파일 시스템 동기화 (target → 스킬 폴더 쓰기/삭제)
├── providers/
│   └── skillsTreeProvider.ts # VS Code TreeDataProvider 구현 (트리 뷰 렌더링)
└── commands/
    └── skillCommands.ts      # 커맨드 핸들러 등록 (refresh, viewSkill, configure 등)
```

### 핵심 데이터 흐름

1. **스킬 로딩**: `GitHubService.fetchTree()` → GitHub API로 디렉토리 트리 탐색 → `SKILL.md`가 있는 폴더는 `SkillNode`, 없는 폴더는 `FolderNode`로 분류
2. **트리 뷰**: `SkillsTreeProvider`가 트리 구조를 VS Code UI에 렌더링. 스킬 노드 하위 파일은 로컬 `target` 폴더에서 읽음
3. **동기화**: 스킬 로드 완료 후 `CopilotService.syncSkills()` 호출 → `skillInventory.target` 설정의 활성화된 경로로 스킬 파일 기록
4. **폴링**: `extension.ts`의 `startPolling()` → `skillInventory.sync.intervalSeconds`(초) 마다 최신 커밋 SHA 비교 → 변경 시 refresh 트리거

### 스킬 포맷

스킬은 Git 저장소의 폴더 단위로 관리. 각 폴더는 반드시 `SKILL.md`를 포함:
```
my-skill/
├── SKILL.md          # YAML frontmatter + 마크다운 본문 (name, description, tags 등)
└── references/       # 추가 참조 파일 (선택)
    └── *.md
```

`Skill.localPath` — 로컬 target 내 상대 경로 (skillsPath 루트 기준). 이 값으로 로컬 파일 경로 및 트리 뷰 하위 파일 읽기에 사용.

### 설정 구조

설정 섹션은 **Source → Sync → Target** 순으로 구성:

- `skillInventory.source.*` — 소스 저장소 연결 정보 (repoUrl, pat, branch, skillsPath)
- `skillInventory.sync.autoSync` — 스킬 자동 동기화 활성화 여부
- `skillInventory.sync.intervalSeconds` — 자동 동기화 주기(초), 최소 30
- `skillInventory.sync.removeStaleSkills` — 원격에 없는 스킬 로컬 삭제 여부
- `skillInventory.target` — 동기화 대상 경로 목록 (`{"경로": true/false}` 형태)
  - 기본값: `.claude/skills`, `~/.claude/skills` 활성화 / `.github/skills`, `~/.github/skills`, `.agents/skills`, `~/.agents/skills` 비활성화

### Context Keys (VS Code)

- `skillInventory.isLoading` — 스킬 로딩 중 여부 (Welcome 뷰 표시 제어)
- `skillInventory.syncEnabled` — autoSync 활성화 여부 (enable/disable 버튼 토글 제어)
