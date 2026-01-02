# GitHub React 개발 및 배포 프로세스

요청하신 "GitHub에 올려서 리액트로 작성하고 자동 배포하는 프로세스"에 대한 가이드입니다.

## 1. 전체 흐름 (Workflow)

1. **Local Development (내 컴퓨터)**
   - 코드를 수정하고 `npm run dev`로 확인합니다.
2. **Push to GitHub (업로드)**
   - 작업한 코드를 GitHub 저장소(Repository)에 "Push" 합니다.
3. **Automated Deployment (자동 배포)**
   - GitHub가 코드가 변경된 것을 감지하고, **GitHub Actions**가 자동으로 실행됩니다.
   - 알아서 `npm run build`를 하고, 결과물을 배포합니다.

---

## 2. 상세 단계

### 1단계: 개발 (Development)
평소처럼 VS Code에서 코드를 수정합니다.
```bash
npm run dev
```
브라우저에서 변경 사항을 확인합니다.

### 2단계: 저장 및 업로드 (Commit & Push)
코드가 마음에 들면 GitHub에 올립니다. (터미널이나 GitHub Desktop 사용)

**GitHub Desktop 사용 시:**
1. 변경된 파일들이 왼쪽에 뜹니다.
2. Summary(제목)를 적고 **Commit to main** 버튼을 누릅니다.
3. 상단의 **Push origin** 버튼을 누릅니다.

### 3단계: 자동 배포 확인
GitHub 웹사이트의 해당 저장소로 갑니다.
1. 상단 **Actions** 탭을 클릭합니다.
2. "Deploy to GitHub Pages" 워크플로우가 **노란색(진행 중)**에서 **초록색(성공)**으로 변하는지 확인합니다.
3. 초록색이 되면 약 1~2분 뒤 실제 사이트에 반영됩니다.

## 3. 사전 준비 (Setup)
이 프로세스가 작동하려면 다음 파일이 프로젝트에 있어야 합니다. (이미 생성해 두었습니다)
- `.github/workflows/deploy.yml`: 자동화 설정 파일

이제부터는 **"코드 수정 -> Push"**만 하면 배포는 자동으로 이루어집니다.
