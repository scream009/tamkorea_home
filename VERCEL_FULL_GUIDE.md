# Vercel 배포 및 가비아 도메인 연결 가이드

요청하신 "GitHub를 통한 배포"와 "가비아 도메인 연결" 두 가지 과정을 통합하여 차례대로 정리했습니다.

---

## 1부: GitHub -> Vercel 배포 (사이트 만들기)

### 순서 1: 코드를 GitHub에 올리기
1. 컴퓨터에서 작업한 코드를 **GitHub 저장소(Repository)**에 올립니다. (GitHub Desktop 등을 사용)
   - *팁: 코드가 수정될 때마다 GitHub에 Push만 하면, 아래 과정 없이 Vercel이 알아서 사이트를 업데이트합니다.*

### 순서 2: Vercel에서 가져오기
1. [Vercel.com](https://vercel.com) 로그인 (GitHub 아이디 사용).
2. 대시보드 오른쪽 위 **"Add New..."** -> **"Project"**.
3. **"Import Git Repository"** 목록에서 `Tam Korea` 프로젝트 옆 **Import** 버튼 클릭.

### 순서 3: 배포하기
1. **Configure Project** 화면에서 다른 설정은 건드리지 않고, **"Deploy"** 버튼 클릭.
2. 폭죽이 터지면 배포가 완료된 것입니다. (기본 `vercel.app` 주소가 생성됨)

---

## 2부: 가비아 도메인 연결 (내 도메인 입히기)

Vercel에서 만든 사이트에 구매하신 `www.tamkorea.com`을 연결하는 과정입니다.

### 순서 1: Vercel에서 도메인 추가
1. Vercel 대시보드에서 방금 만든 프로젝트를 클릭하여 들어갑니다.
2. 상단 메뉴 중 **Settings** -> 왼쪽 메뉴 **Domains** 클릭.
3. 입력창에 `www.tamkorea.com`을 입력하고 **Add** 버튼 클릭.
4. "Invalid Configuration"이라고 뜰 텐데 정상입니다. Vercel이 알려주는 **값(Value)**을 확인합니다.
   - **Type**: `CNAME`
   - **Value**: `cname.vercel-dns.com` (또는 `76.76.21.21` 같은 A Record가 나올 수도 있음)

### 순서 2: 가비아(Gabia)에서 설정 변경
1. [가비아 홈페이지](https://www.gabia.com) 로그인 -> **My가비아** -> **도메인 관리**.
2. `tamkorea.com` 우측의 **"관리"** 버튼 클릭 -> **"DNS 정보"** -> **"DNS 관리"** (또는 설정) 클릭.
3. **DNS 레코드 설정** 화면에서 아래와 같이 2개를 추가/수정합니다.

| 타입 | 호스트 | 값/위치 (Value) |
| :--- | :--- | :--- |
| **CNAME** | `www` | `cname.vercel-dns.com.` (끝에 점 주의, 없으면 그냥 입력) |
| **A** | `@` | `76.76.21.21` |

4. 저장/적용 버튼 클릭.

### 순서 3: 완료 확인
- 설정 후 약 10분~1시간 정도 지나면 전 세계에 전파됩니다.
- 브라우저 주소창에 `www.tamkorea.com`을 입력했을 때, Vercel에서 배포한 사이트가 나오면 성공입니다.
- Vercel Domains 화면에서도 파란색 체크표시(Valid)가 뜹니다.

---
**요약**:
1. GitHub Desktop으로 **Push** 한다.
2. Vercel에서 **Import & Deploy** 한다.
3. Vercel 설정에서 도메인 추가하고, 가비아 가서 **CNAME/A 레코드**를 바꾼다.
