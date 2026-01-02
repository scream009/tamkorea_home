# GitHub Desktop으로 코드 올리기 (초보자용)

현재 컴퓨터에 있는 코드를 GitHub 저장소로 처음 올리는 방법입니다. 복잡한 명령어 없이 클릭만으로 가능합니다.

## 1. 설치 및 로그인
1. [GitHub Desktop 다운로드](https://desktop.github.com/) 후 설치합니다.
2. 실행 후 본인의 GitHub 아이디로 **로그인(Sign in)** 합니다.

## 2. 내 코드를 저장소로 만들기
현재 작업 폴더(`d:\01 work\gravity`)는 아직 GitHub와 연결되지 않은 단순 폴더 상태입니다. 이를 저장소로 만들어야 합니다.

1. GitHub Desktop 메뉴에서 **File** -> **Add local repository...** 클릭.
2. **Local path**의 `Choose...` 버튼을 누르고 `d:\01 work\gravity` 폴더를 선택합니다.
3. 경고창이 뜰 것입니다: *"This directory does not appear to be a Git repository."*
   - 그 바로 옆에 있는 파란색 글씨 **"create a repository"**를 클릭합니다.
4. **Create a New Repository** 창이 뜨면:
   - **Name**: `gravity` (또는 원하는 프로젝트 이름)
   - **Git ignore**: 목록에서 `Node` 선택 (중요! 불필요한 파일 제외용. 만약 이미 `.gitignore`가 있다고 하면 그대로 둡니다)
   - **Create repository** 버튼 클릭.

## 3. GitHub에 올리기 (Publish)
1. 이제 로컬 저장소가 만들어졌습니다.
2. 화면 상단의 파란색 **Publish repository** 버튼을 클릭합니다.
3. **Keep this code private** 체크를 해제하면(공개) 누구나 볼 수 있고, 체크하면(비공개) 나만 볼 수 있습니다. (무료 계정도 비공개 가능)
4. **Publish Repository** 버튼 클릭.

## 4. 완료 확인
- GitHub 웹사이트에 가서 내 저장소 목록을 보면 `gravity` 프로젝트가 올라와 있을 것입니다.
- 이제 Vercel에 가서 이 저장소를 선택(Import)하시면 됩니다.
