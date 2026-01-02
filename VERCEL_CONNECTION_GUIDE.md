# GitHub - Vercel 연결 및 배포 가이드

사용자분께서 기억하시는 "GitHub에 올려서 어디와 연결하는 방식"은 **Vercel** 배포일 가능성이 매우 높습니다. (React/Vite 프로젝트의 표준 배포 방식)

## 1. 개요
- **GitHub**: 코드를 저장하는 창고
- **Vercel**: GitHub 창고와 **"연결"**하여, 코드가 바뀔 때마다 자동으로 웹사이트를 만들어주는 곳

## 2. 연결 및 배포 순서

### 1단계: 코드 GitHub에 올리기 (Push)
먼저 작업하신 코드가 본인의 GitHub 저장소(Repository)에 업로드되어 있어야 합니다.

### 2단계: Vercel 접속 및 가져오기
1. [Vercel 홈페이지](https://vercel.com)에 접속하여 **Log In**을 누릅니다.
2. **"Continue with GitHub"**를 선택하여 로그인합니다.
3. 대시보드 우측 상단의 **"Add New..."** 버튼을 누르고 **"Project"**를 선택합니다.
4. **"Import Git Repository"** 목록에서 배포하려는 프로젝트(Tam Korea)를 찾아 **"Import"** 버튼을 누릅니다.

### 3단계: 설정 및 배포 (Deploy)
1. **Configure Project** 화면이 나타납니다.
   - **Framework Preset**: `Vite` 라고 자동으로 떠야 합니다. (아니라면 선택 목록에서 Vite 선택)
   - **Root Directory**: 루트 폴더(`.`) 그대로 둡니다.
2. 하단의 파란색 **"Deploy"** 버튼을 클릭합니다.
3. 1~2분 정도 화면이 넘어가며 빌드가 진행되고, 완료되면 축하 화면이 나옵니다.

## 3. 결과 확인
- 배포가 끝나면 `https://프로젝트명.vercel.app` 주소가 생성됩니다.
- 이제 컴퓨터에서 코드를 수정하고 **GitHub에 Push**만 하면, Vercel이 알아서 감지하고 자동으로 사이트를 업데이트합니다.
