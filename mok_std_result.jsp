<%@ page import="java.net.HttpURLConnection" %>
<%@ page import="java.net.URL" %>
<%@ page import="java.io.*" %>
<%@ page import="java.util.Date"%>
<%@ page import="java.util.Calendar"%>
<%@ page import="java.text.SimpleDateFormat"%>
<%@ page import="com.dreamsecurity.mobileOK.mobileOKKeyManager" %>
<%@ page import="com.dreamsecurity.json.JSONObject" %>
<%@ page import="java.util.Base64" %>
<%@ page import="com.dreamsecurity.mobileOK.MobileOKException" %>
<%@ page import="java.net.URLDecoder" %>
<%@ page import="java.nio.charset.StandardCharsets" %>

<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%!
    private BufferedReader bufferedReader;

    public boolean isAdultBirth(String birth) {
        try {
            if (birth == null || !birth.matches("\\d{8}")) return false;
            SimpleDateFormat parser = new SimpleDateFormat("yyyyMMdd");
            parser.setLenient(false);
            Date birthday = parser.parse(birth);
            Calendar today = Calendar.getInstance();
            Calendar adultDate = Calendar.getInstance();
            adultDate.setTime(birthday);
            adultDate.add(Calendar.YEAR, 19);
            return !today.before(adultDate);
        } catch (Exception e) {
            return false;
        }
    }

    public String mobileOK_std_result(String result, mobileOKKeyManager mobileOK, HttpSession session) {
        try {
            /* 1. 본인확인 인증결과 MOKToken API 요청 URL */
            /* 개발 및 테스트 시 개발 URL 적용 / 운영 환경에 적용 시 운영 URL 설정 필요 */        
            String dreamEnv = System.getenv("DREAM_AUTH_ENV");
            if (dreamEnv == null || dreamEnv.trim().isEmpty()) dreamEnv = "prod";
            String targetUrl = "prod".equalsIgnoreCase(dreamEnv) || "production".equalsIgnoreCase(dreamEnv)
                ? "https://cert.mobile-ok.com/gui/service/v1/result/request"
                : "https://scert.mobile-ok.com/gui/service/v1/result/request";

            /* 2. 본인확인 결과 타입별 결과 처리 */
            JSONObject resultJSON = new JSONObject(result);
            String encryptMOKKeyToken = resultJSON.optString("encryptMOKKeyToken", null);
            String encryptMOKResult = resultJSON.optString("encryptMOKResult", null);
            
            /* 본인확인 결과 타입 : MOKToken */
            if (encryptMOKKeyToken != null) {
                JSONObject requestData = new JSONObject();
                requestData.put("encryptMOKKeyToken", encryptMOKKeyToken);
                String responseData = sendPost(targetUrl, requestData.toString());
                if (responseData == null) {
                    return "-1|본인확인 MOKToken 인증결과 응답이 없습니다.";
                }
                JSONObject responseJSON = new JSONObject(responseData);
                encryptMOKResult = responseJSON.getString("encryptMOKResult");
            }
            else {
                return "-2|본인확인 MOKToken 값이 없습니다.";
            }

            /* 3. 본인확인 결과 JSON 정보 파싱 */
            JSONObject decrpytResultJson = null;
            try {
                decrpytResultJson = new JSONObject(mobileOK.getResultJSON(encryptMOKResult));
            } catch (MobileOKException e) {
                return e.getErrorCode() + "|" + e.getMessage();
            }

            /* 4. 본인확인 결과 복호화 */
			String sessionClientTxId = (String) session.getAttribute("sessionClientTxId");
			
			/* 이용기관 거래 ID */
            String clientTxId = decrpytResultJson.optString("clientTxId", null);
			
            // 세션 내 요청 clientTxId 와 수신한 clientTxId 가 동일한지 비교
            if (sessionClientTxId == null || !sessionClientTxId.equals(clientTxId)) {
                return "-4|세션값에 저장된 거래ID 비교 실패";
            }

            /* 사용자 이름 */
            String userName = decrpytResultJson.optString("userName", null);
            /* 이용기관 ID */
            String siteID = decrpytResultJson.optString("siteID", null);
            /* 본인확인 거래 ID */
            String txId = decrpytResultJson.optString("txId", null);
            /* 서비스제공자(인증사업자) ID */
            String providerId = decrpytResultJson.optString("providerId", null);
            /* 이용 서비스 유형 */
            String serviceType = decrpytResultJson.optString("serviceType", null);
            /* 시용자 CI */
            String ci = decrpytResultJson.optString("ci", null);
            /* 사용자 DI */
            String di = decrpytResultJson.optString("di", null);
            /* 사용자 전화번호 */
            String userPhone = decrpytResultJson.optString("userPhone", null);
            /* 사용자 생년월일 */
            String userBirthday = decrpytResultJson.optString("userBirthday", null);
            /* 사용자 성별 (1: 남자, 2: 여자) */
            String userGender = decrpytResultJson.optString("userGender", null);
            /* 사용자 국적 (0: 내국인, 1: 외국인) */
            String userNation = decrpytResultJson.optString("userNation", null);
            /* 본인확인 인증 종류 */
            String reqAuthType = decrpytResultJson.getString("reqAuthType");
            /* 본인확인 요청 시간 */
            String reqDate = decrpytResultJson.getString("reqDate");
            /* 본인확인 인증 서버 */
            String issuer = decrpytResultJson.getString("issuer");
            /* 본인확인 인증 시간 */
            String issueDate = decrpytResultJson.getString("issueDate");

            /* 5. 이용기관 응답데이터 세션 및 검증유효시간 처리  */

            // 검증정보 유효시간 검증 (본인확인 요청 후 10분 이내 검증 완료 권고) */
            String dataFormat = "yyyy-MM-dd HH:mm:ss";
            SimpleDateFormat formatter = new SimpleDateFormat(dataFormat);

            Date currentTime = formatter.parse(formatter.format(new Date()));
            Date targetTime = formatter.parse(issueDate);

            long diff = (currentTime.getTime() - targetTime.getTime()) / 1000;
            if (diff > 600) {
                return "-5|검증결과 토큰 생성 10분 경과 오류";
            }

            /* 6. 가맹점 검증 */

            // - 가맹점 측에서 기 수집 및 보유한 개인정보가 있는 경우 드림으로부터 제공받은 개인정보와 일치 여부를 반드시 검증 필요
            //   ➔ 검증 완료 시 사용자에 대한 본인확인 완료
            // - CI 일치 여부 검증 권장

            /* 7. 본인확인 결과 응답 */

            // 복호화된 개인정보는 DB보관 또는 세션보관하여 개인정보 저장시 본인확인에서 획득한 정보로 저장하도록 처리 필요
            // 개인정보를 웹브라우져에 전달할 경우 외부 해킹에 의해 유출되지 않도록 보안처리 필요

            JSONObject outputJson = new JSONObject();
            outputJson.put("resultCode", resultJSON.optString("resultCode", null));
            outputJson.put("resultMsg", resultJSON.optString("resultMsg", null));
            outputJson.put("verified", true);
            outputJson.put("provider", "dreamsecurity");
            outputJson.put("txId", txId);
            outputJson.put("clientTxId", clientTxId);
            outputJson.put("name", userName);
            outputJson.put("phone", userPhone);
            outputJson.put("birth", userBirthday);
            outputJson.put("adult", isAdultBirth(userBirthday));
            outputJson.put("userName", userName);
            outputJson.put("userPhone", userPhone);
            outputJson.put("userBirthday", userBirthday);
            outputJson.put("userGender", userGender);
            outputJson.put("userNation", userNation);
            outputJson.put("ci", ci);
            outputJson.put("di", di);
            return outputJson.toString();
        } catch (Exception e) {
            e.printStackTrace();
            return "-999|서버 오류";
        }
    }

    /* 본인확인 서버 통신 예제 함수 */
    public String sendPost(String dest, String jsonData) {
        HttpURLConnection connection = null;
        DataOutputStream dataOutputStream = null;
        try {
            URL url = new URL(dest);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Content-Type", "application/json;charset=UTF-8");
            connection.setDoOutput(true);

            dataOutputStream = new DataOutputStream(connection.getOutputStream());
            dataOutputStream.write(jsonData.getBytes("UTF-8"));

            bufferedReader = new BufferedReader(new InputStreamReader(connection.getInputStream()));
            StringBuffer responseData = new StringBuffer();
            String info;
            while ((info = bufferedReader.readLine()) != null) {
                responseData.append(info);
            }
            return responseData.toString();
        } catch (FileNotFoundException e) {
            // Error Stream contains JSON that we can parse to a FB error
            e.printStackTrace();
        } catch (IOException e) {
            e.printStackTrace();
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            try {
                if (bufferedReader != null) {
                    bufferedReader.close();
                }

                if (dataOutputStream != null) {
                    dataOutputStream.close();
                }

                if (connection != null) {
                    connection.disconnect();
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
        return null;
    }
%>

<%
    /* 2. 본인확인 서비스 API 설정 */
    mobileOKKeyManager mobileOK = null;
    String data = null;
    try {
        mobileOK = new mobileOKKeyManager();
        /* 키파일은 반드시 서버의 안전한 로컬경로에 별도 저장. 웹URL 경로에 파일이 있을경우 키파일이 외부에 노출될 수 있음 주의 */
        /* 키파일은 개발용과 운영용으로 구분 ➔ 개발 및 테스트 시 개발용 키파일을 이용 / 운영 환경에 적용 시 운영용 키파일로 변경 적용 필요 */                
        String keyPath = System.getenv("DREAM_KEY_PATH");
        if (keyPath == null || keyPath.trim().isEmpty()) keyPath = "/home/user/tthing/prod_keys/mok_keyInfo.dat";
        String keyPassword = System.getenv("DREAM_KEY_PASSWORD");
        if (keyPassword == null) keyPassword = "";
        mobileOK.keyInit(keyPath, keyPassword);
        /* 3. 본인확인 인증 결과 암호문 수신 */
        data = request.getParameter("data");
        data = URLDecoder.decode(data, "UTF-8");
    } catch (MobileOKException e) {
        out.write(e.getErrorCode() + "|" + e.getMessage());
        return;
    } catch (Exception e) {
        e.printStackTrace();
    }
%>

<%-- 4. 본인확인 결과 응답 방식 --%>
<%-- 4.1 : 팝업창 : callback 함수 사용  --%>
<%= mobileOK_std_result(data, mobileOK, session) %>
