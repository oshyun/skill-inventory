---
description: "Collect GitHub Enterprise activity for a specific period and generate weekly report documentation. Use when: (1) Weekly report creation requested, (2) Summarizing work activities for a time period, (3) Generating activity summary for handover or status updates. Trigger keywords: weekly report, activity summary, work summary, status report"
---
<!-- fdc-skills-generated -->

# Weekly Report

GitHub Enterprise 활동을 수집하고 주간 보고서를 생성한다.

## Supported MCP Servers

| Repository | MCP Server | Usage Condition |
|------------|------------|-----------------|
| oss.fin.navercorp.com | oss.fin | Default |

## Workflow

### 1. Identify Target Information

사용자에게 다음 정보를 확인한다:
- User GitHub ID (default: kilnam-kim)
- Organization name (default: fintelligence)
- Period (default: 지난주 수요일 17:00 ~ 이번주 수요일 17:00 KST)

### 2. Calculate Period

주간 보고서 기간을 계산한다:
- Start date: 지난주 수요일 17:00 KST
- End date: 이번주 수요일 17:00 KST
- ISO 8601 형식으로 변환 (e.g., 2026-02-04T08:00:00Z)

기간 계산 규칙:
- 현재 요일이 수요일 17:00 이후인 경우: 이번주 수요일이 end date
- 현재 요일이 수요일 17:00 이전이거나 다른 요일인 경우: 직전 수요일이 end date
- start date는 end date 기준 7일 전 수요일

### 3. Search Activity

MCP 도구로 GitHub 활동을 검색한다:

```
search_issues:
  q: "involves:{user} org:{org} updated:{start_date}..{end_date}"
  per_page: 100
```

### 4. Compose Weekly Comment

수집된 활동을 바탕으로 두 가지 필수 섹션을 구성한다.

#### 필수 포함 항목

- 이번 주 업무 중 고민한 포인트
- 기존 방식에서 변경되어 공유가 필요한 내용
- 논의 안건 (10분 내 논의 -> 스크럼, 추가 시간 필요 -> 화/금 논의 시간 활용)
- 방향 결정 필요 사항
- 팀에 공유할 성과 또는 의미 있는 변화

#### 섹션 1: 진행 과정 중심

GitHub 활동에서 다음 항목을 추출하여 작성한다:
- 고민한 포인트: PR 리뷰 코멘트, 이슈 논의에서 의사결정이 필요했던 내용
- 변경된 업무 내용: 기존 방식과 달라진 변화
- 논의할 안건: 열린 이슈 중 팀 논의가 필요한 항목
- 방향 결정 필요: 아직 결론이 나지 않은 사안
- 이슈 공유: 장애, 버그, 주의가 필요한 사항

#### 섹션 2: 일감 중심

GitHub 활동을 분류하여 작성한다:
- 이번 주 완료한 일: state: closed, closed_at이 기간 내인 이슈/PR
- 이번 주 진행 중인 일: state: open, updated_at이 기간 내인 이슈/PR
- 이번 주 새롭게 시작한 일: created_at이 기간 내인 이슈/PR

### 5. Write Document

`docs/weekly-report-{start_date}-{end_date}.md` 파일로 저장한다.

## Document Template

```markdown
# Weekly Report ({start_date} ~ {end_date})

> Author: {username}
> Organization: {org_name}

## 1. 진행 과정 중심

### 고민한 포인트

- {업무 중 고민했던 내용}

### 변경된 업무 내용

- {기존과 달라진 변화}

### 논의할 안건

- {팀 논의가 필요한 항목}

### 방향 결정 필요

- {결론이 나지 않은 사안}

### 이슈 공유

- {장애, 버그, 주의 사항}

## 2. 일감 중심

### 이번 주 완료한 일

- [{repository}#{number}]({link}): {title}

### 이번 주 진행 중인 일

- [{repository}#{number}]({link}): {title}

### 이번 주 새롭게 시작한 일

- [{repository}#{number}]({link}): {title}
```

## 작성 예시

### 진행 과정 중심 예시

```markdown
## 1. 진행 과정 중심

### 고민한 포인트

- 데이터 파이프라인 재처리 범위를 어디까지 할지 고민. 전체 재처리는 비용이 크고, 부분 재처리는 정합성 리스크가 있음.

### 변경된 업무 내용

- Airflow DAG 스케줄을 일 1회에서 일 2회로 변경. 데이터 지연 이슈 대응 목적.

### 논의할 안건

- Trino 클러스터 메모리 설정 변경 건 (10분 내 가능, 스크럼에서 논의)

### 방향 결정 필요

- 신규 테이블 네이밍 컨벤션 통일 필요. 현재 팀 내 2가지 방식이 혼용됨.

### 이슈 공유

- 화요일 오전 Hadoop DataNode 1대 디스크 장애 발생, 복구 완료.
```

### 일감 중심 예시

```markdown
## 2. 일감 중심

### 이번 주 완료한 일

- [dataoverflow#234](https://oss.fin.navercorp.com/fintelligence/dataoverflow/issues/234): Airflow DAG 스케줄 변경
- [dataoverflow#230](https://oss.fin.navercorp.com/fintelligence/dataoverflow/pull/230): Trino 쿼리 타임아웃 설정 PR

### 이번 주 진행 중인 일

- [dataoverflow#240](https://oss.fin.navercorp.com/fintelligence/dataoverflow/issues/240): 데이터 파이프라인 재처리 범위 검토

### 이번 주 새롭게 시작한 일

- [dataoverflow#245](https://oss.fin.navercorp.com/fintelligence/dataoverflow/issues/245): 신규 테이블 네이밍 컨벤션 정리
```

## Item Format

각 일감 항목은 다음 형식으로 작성한다:

```markdown
- [{repository}#{number}]({link}): {title}