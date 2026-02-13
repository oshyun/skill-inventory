---
description: "Collect development history from GitHub and generate markdown documentation. Use when: (1) Development history documentation requested, (2) Change history/history tracking, (3) Handover document creation, (4) Timeline generation based on issues/PRs/commits, (5) Documenting development process of specific features/bugs. Trigger keywords: history, change history, development process, handover, timeline"
---
<!-- fdc-skills-generated -->

# 개발 이력 문서화

GitHub MCP 서버를 사용하여 커밋, PR, 이슈, 코드를 검색하고 타임라인 형식으로 개발 이력을 문서화한다.

## 지원 MCP 서버

| 저장소 | MCP 서버 | 사용 조건 |
|--------|----------|-----------|
| oss.fin.navercorp.com | oss.fin | 기본값 |
| oss.navercorp.com | oss | "oss" 명시 시 |
| github.com | github | "github" 명시 시 |

## 입력 유형과 검색 방법

| 유형 | 예시 | 검색 방법 |
|------|------|-----------|
| 키워드 | auth, payment | search_issues + list_commits |
| 이슈 번호 | #1234 | get_issue -> get_pull_request -> get_commit |
| 파일 경로 | auth/login.ts | list_commits(path) |
| 함수명 | useAuth | search_code + list_commits |

## 원칙

- 로컬 파일 시스템 검색을 사용하지 않는다: search_files, read_file, list_files 등 로컬 도구를 사용하지 않는다
- MCP GitHub 서버 도구만 사용하여 이력을 수집한다
- 로컬 저장소가 있더라도 GitHub 원격 저장소에서 정보를 조회한다

## 워크플로우

### 1. 대상 확인

사용자에게 다음 정보를 확인한다:
- 저장소 정보 (owner/repo)
- 수집 대상: 기능명, 이슈 번호, 키워드, 파일 경로 등
- 문서화 목적: 인수인계, 버그 분석, 기능 이력

### 2. 이력 수집

MCP 도구로 관련 데이터를 수집한다:

**이슈/PR 검색**
```
search_issues: is:issue OR is:pr {keyword} repo:{owner}/{repo}
```

**커밋 검색**
```
list_commits: owner, repo, sha(브랜치), path(파일 경로)
get_commit: 커밋 상세 정보
```

**코드 검색**
```
search_code: {keyword} repo:{owner}/{repo}
```

**특정 이슈/PR 상세**
```
get_issue: owner, repo, issue_number
get_pull_request: owner, repo, pullNumber
get_pull_request_files: 변경된 파일 목록
get_pull_request_comments: 리뷰 코멘트
```

### 3. 의사결정 추출

이슈/PR 코멘트에서 개발 의사결정 내용을 추출한다:

- 구현 방식 선택 이유
- 대안 검토 및 선택 근거
- 리뷰어 피드백에 따른 변경 사항
- 엣지 케이스 처리 결정

코멘트 조회:
```
get_issue_comments: owner, repo, issue_number
get_pull_request_comments: owner, repo, pullNumber
```

### 4. 문서 작성

수집된 정보를 `docs/hist-{keyword}.md` 경로에 저장한다.

**링크 형식:**

| 유형 | URL 형식 |
|------|----------|
| 이슈 | `https://{host}/{owner}/{repo}/issues/{number}` |
| 이슈 코멘트 | `https://{host}/{owner}/{repo}/issues/{number}#issuecomment-{id}` |
| PR | `https://{host}/{owner}/{repo}/pull/{number}` |
| 커밋 | `https://{host}/{owner}/{repo}/commit/{sha}` |

**문서 구조:**

```markdown
# [기능/버그명] 개발 이력

> 작성일: {date}
> 검색 키워드: {keywords}
> 관련 저장소: {owner}/{repo}

## 현재 상태 요약

{현재 기능/버그의 최종 상태. 핵심 동작, 주요 변경 사항 요약, 현재 적용된 솔루션, 주요 파일 등을 포함한다.}

## 변경 이력

### YYYY-MM-DD: [변경 제목]

**배경** - 이 변경이 필요했던 이유

변경 사항에 대한 상세 설명.

**변경 전:**
\`\`\`typescript
// 원본 코드
\`\`\`

**변경 후:**
\`\`\`typescript
// 변경된 코드
\`\`\`

**관련 링크:**
- 이슈: #number [제목](링크)
- PR: #number [제목](링크)
- 커밋: sha [메시지](링크)

---

## 핵심 의사결정

### [결정 1]: 제목

- 배경: 이 결정이 필요했던 이유
- 대안: 검토했던 다른 선택지
- 근거: 최종 선택 이유
- 관련 링크: 논의가 이루어진 이슈/PR 코멘트

## 관련 코드

- `path/to/file.py`: 핵심 로직 설명
- `path/to/config.yaml`: 설정 파일 역할

## 참고 자료

- [문서 제목](링크): 관련 설명
- [위키/가이드](링크): 추가 참고 문서

## 결론

{사용자 질문에 대한 명확한 답변. 인수인계를 위한 핵심 사항 요약}
```

## 작성 원칙

### DO

- 각 변경에 대한 배경/맥락을 포함한다 (왜 변경했는지)
- 이해에 도움이 되는 경우 변경 전/후 코드를 비교한다
- 관련 링크(이슈, PR, 커밋)를 필수로 포함한다
- 의사결정 근거와 대안 검토 내용을 기록한다
- 현재 상태 요약에 핵심 내용과 최종 솔루션을 포함한다
- 참고 자료 섹션에 관련 문서/위키 링크를 포함한다
- 결론에 사용자 질문에 대한 명확한 답변을 작성한다

### DON'T

- 맥락 없이 단순 목록만 나열하지 않는다
- 불필요한 메타데이터를 나열하지 않는다
- 중복 항목을 포함하지 않는다
- "무엇"만 나열하고 "왜"를 생략하지 않는다

## 도구 참조

| 도구 | 용도 |
|------|------|
| `search_issues` | 이슈/PR 키워드 검색 |
| `search_code` | 코드 내 키워드 검색 |
| `list_commits` | 커밋 이력 조회 |
| `get_commit` | 커밋 상세 정보 |
| `get_issue` | 이슈 상세 정보 |
| `get_issue_comments` | 이슈 코멘트 (의사결정 추출) |
| `get_pull_request` | PR 상세 정보 |
| `get_pull_request_files` | PR 변경 파일 |
| `get_pull_request_comments` | PR 리뷰 코멘트 (의사결정 추출) |
| `get_file_contents` | 파일 내용 조회 |

## MCP 서버 선택

기본으로 oss.fin MCP 서버를 사용한다. 명시적으로 지정된 경우에만 다른 서버를 사용한다.

| 저장소 | MCP 서버 | 사용 조건 |
|--------|----------|-----------|
| oss.fin.navercorp.com | oss.fin | 기본값 (미지정 시 사용) |
| oss.navercorp.com | oss | "oss" 명시 시 |
| github.com | github | "github" 명시 시 |

선택 규칙:
1. 저장소 URL 또는 설명에 "github.com"이 포함되면 github 서버를 사용한다
2. 저장소 URL 또는 설명에 "oss.navercorp.com"이 포함되면 oss 서버를 사용한다
3. 그 외 모든 경우 oss.fin 서버를 기본으로 사용한다