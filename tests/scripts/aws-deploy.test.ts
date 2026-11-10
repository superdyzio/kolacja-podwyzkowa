import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  RETENTION_JOB_NAME as APP_JOB_NAME,
  RETENTION_JOB_PATH as APP_JOB_PATH,
  MIN_RETENTION_TOKEN_LENGTH as APP_MIN_TOKEN_LENGTH,
  RetentionJobBody,
} from "@/lib/privacy/job";
import {
  ALLOWED_KEYS,
  awsArgs,
  awsCommands,
  dryRunPlan,
  formatCommand,
  functionEnvironment,
  isValidRegion,
  layerArn,
  MIN_RETENTION_TOKEN_LENGTH,
  missingUrlPermissions,
  nextSteps,
  parseEnvFile,
  redact,
  RETENTION_JOB_NAME,
  RETENTION_JOB_PATH,
  retentionCheckCommands,
  retentionScheduleInput,
  retentionScheduleTarget,
  SCHEDULE_NAME,
  schedulerCommands,
  SECRET_KEYS,
  validateDeployEnv,
} from "../../scripts/lib/aws-deploy.mjs";

// Pure parts of `npm run deploy:aws` with fixtures only: no aws CLI, no network, no real secrets.

const TARGET = { profile: "mikusia", region: "eu-central-1" };
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiJ9.fake-service-role-payload.fake-signature";
const ANTHROPIC_KEY = "sk-ant-fake-0123456789abcdef";
const RETENTION_TOKEN = "0123456789abcdef".repeat(4);
const ENV_AWS = `# production (fixture)
SUPABASE_URL=https://abcdefghijklmnop.supabase.co
SUPABASE_SERVICE_ROLE_KEY="${SERVICE_KEY}"
export AI_PROVIDER=anthropic   # Claude
ANTHROPIC_API_KEY='${ANTHROPIC_KEY}'
AI_MODEL=
`;
const FILES = { zipPath: "dist-lambda/function.zip", envFile: "/tmp/kolacja-deploy-x/env.json", roleArn: "arn:role" };

function valid(values: Record<string, string>): Record<string, string> {
  const result = validateDeployEnv(values);
  if (!result.ok) throw new Error(result.errors.join(" "));
  return result.variables;
}

function errorsOf(values: Record<string, string>): string[] {
  const result = validateDeployEnv(values);
  return result.ok ? [] : result.errors;
}

describe("parseEnvFile", () => {
  it("reads values with quotes, export, comments and blank lines", () => {
    expect(parseEnvFile(ENV_AWS)).toEqual({
      values: {
        SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
        AI_PROVIDER: "anthropic",
        ANTHROPIC_API_KEY: ANTHROPIC_KEY,
        AI_MODEL: "",
      },
      errors: [],
    });
  });

  it("reports malformed lines and repeated names with line numbers", () => {
    expect(
      parseEnvFile("SUPABASE_URL=https://a.supabase.co\nnot a line\nSUPABASE_URL=https://b.supabase.co").errors,
    ).toEqual(["Linia 2: oczekiwano NAZWA=wartość.", "Linia 3: SUPABASE_URL występuje drugi raz."]);
  });
});

describe("validateDeployEnv", () => {
  const base = { SUPABASE_URL: "https://abcdefghijklmnop.supabase.co", SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY };

  it("defaults the AI provider to the mock and drops empty values", () => {
    expect(valid({ ...base, AI_MODEL: "" })).toEqual({ ...base, AI_PROVIDER: "mock" });
  });

  it("accepts anthropic with a key and a model", () => {
    const variables = valid({ ...base, AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: ANTHROPIC_KEY, AI_MODEL: "x" });
    expect(variables).toMatchObject({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: ANTHROPIC_KEY, AI_MODEL: "x" });
  });

  it("refuses a local database", () => {
    for (const url of [
      "http://127.0.0.1:54321",
      "http://localhost:54321",
      "https://localhost",
      "http://192.168.1.5:54321",
    ]) {
      expect(errorsOf({ ...base, SUPABASE_URL: url }), url).toEqual([
        "SUPABASE_URL wskazuje lokalną bazę — na AWS potrzebny jest hostowany projekt Supabase.",
      ]);
    }
  });

  it("refuses plain http, a non-URL, missing and unknown names", () => {
    expect(errorsOf({ ...base, SUPABASE_URL: "http://abc.supabase.co" })).toEqual([
      "SUPABASE_URL musi zaczynać się od https://.",
    ]);
    expect(errorsOf({ ...base, SUPABASE_URL: "abc.supabase.co" })).toEqual(["SUPABASE_URL nie jest adresem URL."]);
    expect(errorsOf({ SUPABASE_URL: base.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: "" })).toEqual([
      "Brak SUPABASE_SERVICE_ROLE_KEY.",
    ]);
    expect(errorsOf({ ...base, ANTHROPIC_KEY: "x" })).toEqual([
      `Nieznana zmienna ANTHROPIC_KEY (dozwolone: ${ALLOWED_KEYS.join(", ")}).`,
    ]);
  });

  it("takes an optional RETENTION_TOKEN of at least 32 base64 / hex characters (the daily clean-up)", () => {
    expect(valid({ ...base, RETENTION_TOKEN })).toMatchObject({ RETENTION_TOKEN });
    expect(valid({ ...base, RETENTION_TOKEN: "Ab0+/=_-".repeat(4) })).toMatchObject({
      RETENTION_TOKEN: "Ab0+/=_-".repeat(4),
    });
    expect(valid({ ...base, RETENTION_TOKEN: "" })).not.toHaveProperty("RETENTION_TOKEN");
    for (const bad of ["x".repeat(31), `${"x".repeat(32)}!`, `${"x".repeat(16)} ${"x".repeat(16)}`]) {
      expect(errorsOf({ ...base, RETENTION_TOKEN: bad }), bad).toEqual([
        "RETENTION_TOKEN: co najmniej 32 znaki (litery, cyfry, + / = _ -) — wygeneruj: openssl rand -hex 32.",
      ]);
    }
    expect(SECRET_KEYS).toContain("RETENTION_TOKEN");
  });

  it("refuses an unknown provider and anthropic without a key", () => {
    expect(errorsOf({ ...base, AI_PROVIDER: "openai" })).toEqual(["AI_PROVIDER musi być jednym z: mock, anthropic."]);
    expect(errorsOf({ ...base, AI_PROVIDER: "anthropic" })).toEqual([
      "AI_PROVIDER=anthropic wymaga ANTHROPIC_API_KEY.",
    ]);
  });
});

describe("functionEnvironment", () => {
  it("is the complete set: Lambda Web Adapter wrapper, port, static readiness path and the app's variables", () => {
    const app = valid(parseEnvFile(ENV_AWS).values);
    expect(functionEnvironment(app)).toEqual({
      AWS_LAMBDA_EXEC_WRAPPER: "/opt/bootstrap",
      PORT: "8080",
      AWS_LWA_READINESS_CHECK_PATH: "/favicon.png",
      AWS_LWA_PASS_THROUGH_PATH: "/api/jobs/retention",
      SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
      AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: ANTHROPIC_KEY,
    });
  });
});

describe("region and layer", () => {
  it("accepts AWS region names only", () => {
    expect(["eu-central-1", "us-east-2", "ap-southeast-1", "us-gov-west-1"].every(isValidRegion)).toBe(true);
    expect([undefined, "", "eu-central", "EU-CENTRAL-1", "eu-central-1 "].some(isValidRegion)).toBe(false);
  });

  it("pins the arm64 Lambda Web Adapter layer in the target region", () => {
    expect(layerArn("eu-central-1")).toBe("arn:aws:lambda:eu-central-1:753240598075:layer:LambdaAdapterLayerArm64:30");
  });
});

describe("awsCommands", () => {
  const commands = awsCommands(TARGET, FILES);
  const flag = (args: string[], name: string) => args[args.indexOf(name) + 1];

  it("always passes the profile and the region explicitly, JSON output and no pager", () => {
    expect(awsArgs(TARGET, ["sts", "get-caller-identity"])).toEqual([
      "sts",
      "get-caller-identity",
      "--profile",
      "mikusia",
      "--region",
      "eu-central-1",
      "--output",
      "json",
      "--no-cli-pager",
    ]);
    for (const args of Object.values(commands)) {
      expect(flag(args, "--profile")).toBe("mikusia");
      expect(flag(args, "--region")).toBe("eu-central-1");
    }
  });

  it("never deletes anything", () => {
    expect(
      Object.values(commands)
        .flat()
        .filter((arg) => /delete|remove/i.test(arg)),
    ).toEqual([]);
  });

  it("creates an arm64 function on nodejs24.x with run.sh, 1024 MB, 30 s, the layer and the env file", () => {
    const args = commands.createFunction;
    expect(args.slice(0, 2)).toEqual(["lambda", "create-function"]);
    expect(flag(args, "--function-name")).toBe("kolacja-podwyzkowa");
    expect(flag(args, "--architectures")).toBe("arm64");
    expect(flag(args, "--runtime")).toBe("nodejs24.x");
    expect(flag(args, "--handler")).toBe("run.sh");
    expect(flag(args, "--memory-size")).toBe("1024");
    expect(flag(args, "--timeout")).toBe("30");
    expect(flag(args, "--layers")).toBe(layerArn("eu-central-1"));
    expect(flag(args, "--role")).toBe("arn:role");
    expect(flag(args, "--zip-file")).toBe("fileb://dist-lambda/function.zip");
    expect(flag(args, "--environment")).toBe("file:///tmp/kolacja-deploy-x/env.json");
  });

  it("updates code and the whole configuration in place", () => {
    expect(commands.updateCode.slice(0, 2)).toEqual(["lambda", "update-function-code"]);
    expect(flag(commands.updateCode, "--zip-file")).toBe("fileb://dist-lambda/function.zip");
    const config = commands.updateConfiguration;
    expect(config.slice(0, 2)).toEqual(["lambda", "update-function-configuration"]);
    for (const name of [
      "--runtime",
      "--handler",
      "--memory-size",
      "--timeout",
      "--layers",
      "--environment",
      "--role",
    ]) {
      expect(flag(config, name), name).toBe(flag(commands.createFunction, name));
    }
  });

  it("opens a public Function URL with both permissions", () => {
    expect(flag(commands.createUrl, "--auth-type")).toBe("NONE");
    expect(commands.addUrlPermission).toEqual(
      expect.arrayContaining(["lambda:InvokeFunctionUrl", "*", "--function-url-auth-type", "NONE"]),
    );
    expect(commands.addInvokePermission).toEqual(
      expect.arrayContaining(["lambda:InvokeFunction", "*", "--invoked-via-function-url"]),
    );
  });

  it("gives the role only the basic execution policy and Lambda as the trusted service", () => {
    expect(flag(commands.attachBasicPolicy, "--policy-arn")).toBe(
      "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    );
    expect(JSON.parse(flag(commands.createRole, "--assume-role-policy-document"))).toEqual({
      Version: "2012-10-17",
      Statement: [{ Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" }],
    });
  });

  it("keeps CloudWatch logs for 7 days", () => {
    expect(flag(commands.putRetention, "--retention-in-days")).toBe("7");
    expect(flag(commands.putRetention, "--log-group-name")).toBe("/aws/lambda/kolacja-podwyzkowa");
  });
});

describe("the daily clean-up's schedule", () => {
  const FUNCTION_ARN = "arn:aws:lambda:eu-central-1:123456789012:function:kolacja-podwyzkowa";
  const commands = schedulerCommands(TARGET, {
    account: "123456789012",
    functionArn: FUNCTION_ARN,
    targetFile: "/tmp/kolacja-deploy-x/schedule-target.json",
  });
  const flag = (args: string[], name: string) => args[args.indexOf(name) + 1];

  it("matches the app: the pass-through path is the route's file, the input is exactly what the route accepts", () => {
    expect(RETENTION_JOB_PATH).toBe(APP_JOB_PATH);
    expect(RETENTION_JOB_NAME).toBe(APP_JOB_NAME);
    expect(MIN_RETENTION_TOKEN_LENGTH).toBe(APP_MIN_TOKEN_LENGTH);
    expect(existsSync(path.join(process.cwd(), "src/pages", `${RETENTION_JOB_PATH}.ts`))).toBe(true);
    expect(RetentionJobBody.parse(JSON.parse(retentionScheduleInput(RETENTION_TOKEN)))).toEqual({
      job: "guest-data-retention",
      token: RETENTION_TOKEN,
    });
  });

  it("gives Scheduler of this account a role that may only invoke this function", () => {
    expect(JSON.parse(flag(commands.createSchedulerRole, "--assume-role-policy-document"))).toEqual({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "scheduler.amazonaws.com" },
          Action: "sts:AssumeRole",
          Condition: { StringEquals: { "aws:SourceAccount": "123456789012" } },
        },
      ],
    });
    expect(flag(commands.updateSchedulerTrust, "--policy-document")).toBe(
      flag(commands.createSchedulerRole, "--assume-role-policy-document"),
    );
    expect(JSON.parse(flag(commands.putSchedulerPolicy, "--policy-document"))).toEqual({
      Version: "2012-10-17",
      Statement: [{ Effect: "Allow", Action: "lambda:InvokeFunction", Resource: FUNCTION_ARN }],
    });
    expect(flag(commands.createSchedulerRole, "--role-name")).toBe("kolacja-podwyzkowa-scheduler");
  });

  it("runs daily at a quiet hour in Polish time, exactly on time, and creates or updates with every field", () => {
    const create = commands.createSchedule;
    expect(create.slice(0, 2)).toEqual(["scheduler", "create-schedule"]);
    expect(flag(create, "--name")).toBe(SCHEDULE_NAME);
    expect(SCHEDULE_NAME).toBe("kolacja-podwyzkowa-retention");
    expect(flag(create, "--schedule-expression")).toBe("cron(15 4 * * ? *)");
    expect(flag(create, "--schedule-expression-timezone")).toBe("Europe/Warsaw");
    expect(JSON.parse(flag(create, "--flexible-time-window"))).toEqual({ Mode: "OFF" });
    expect(flag(create, "--state")).toBe("ENABLED");
    expect(flag(create, "--target")).toBe("file:///tmp/kolacja-deploy-x/schedule-target.json");
    expect(commands.updateSchedule.slice(0, 2)).toEqual(["scheduler", "update-schedule"]);
    expect(commands.updateSchedule.slice(2)).toEqual(create.slice(2));
  });

  it("keeps the token off the command line: the target with the input goes through the temp file", () => {
    const target = retentionScheduleTarget({ functionArn: FUNCTION_ARN, roleArn: "arn:role", token: RETENTION_TOKEN });
    expect(target).toEqual({
      Arn: FUNCTION_ARN,
      RoleArn: "arn:role",
      Input: JSON.stringify({ job: "guest-data-retention", token: RETENTION_TOKEN }),
    });
    expect(Object.values(commands).flat().join(" ")).not.toContain(RETENTION_TOKEN);
  });

  it("always passes the profile and the region, and never deletes anything", () => {
    for (const args of Object.values(commands)) {
      expect(flag(args, "--profile")).toBe("mikusia");
      expect(flag(args, "--region")).toBe("eu-central-1");
    }
    expect(
      Object.values(commands)
        .flat()
        .filter((arg) => /delete|remove/i.test(arg)),
    ).toEqual([]);
  });

  it("checks by hand with the schedule's own input from a private temp directory, never the token itself", () => {
    const lines = retentionCheckCommands(TARGET);
    expect(lines[0]).toBe('d="$(mktemp -d)"');
    expect(lines.join("\n")).toContain(
      'aws scheduler get-schedule --name kolacja-podwyzkowa-retention --query Target.Input --output text --profile mikusia --region eu-central-1 > "$d/input.json"',
    );
    expect(lines.join("\n")).toContain(
      'aws lambda invoke --function-name kolacja-podwyzkowa --payload "fileb://$d/input.json"',
    );
    expect(lines.join("\n")).toContain(
      "aws logs tail /aws/lambda/kolacja-podwyzkowa --since 15m --filter-pattern Retencja",
    );
    expect(lines.join("\n")).not.toMatch(/token/i);
  });
});

describe("missingUrlPermissions", () => {
  const urlStatement = {
    Sid: "FunctionURLAllowPublicAccess",
    Effect: "Allow",
    Principal: "*",
    Action: "lambda:InvokeFunctionUrl",
    Resource: "arn:aws:lambda:eu-central-1:123456789012:function:kolacja-podwyzkowa",
    Condition: { StringEquals: { "lambda:FunctionUrlAuthType": "NONE" } },
  };
  const invokeStatement = {
    Sid: "FunctionURLInvokeAllowPublicAccess",
    Effect: "Allow",
    Principal: "*",
    Action: "lambda:InvokeFunction",
    Resource: "arn:aws:lambda:eu-central-1:123456789012:function:kolacja-podwyzkowa",
    Condition: { Bool: { "lambda:InvokedViaFunctionUrl": "true" } },
  };
  const policy = (...Statement: object[]) => JSON.stringify({ Version: "2012-10-17", Statement });

  it("needs both without a policy and none when the console-style policy is there", () => {
    expect(missingUrlPermissions(null)).toEqual({ url: true, invoke: true });
    expect(missingUrlPermissions(policy(urlStatement, invokeStatement))).toEqual({ url: false, invoke: false });
  });

  it("adds only what is missing, whatever the statement ids", () => {
    expect(missingUrlPermissions(policy({ ...urlStatement, Sid: "other" }))).toEqual({ url: false, invoke: true });
    expect(missingUrlPermissions(policy({ ...invokeStatement, Principal: { AWS: "*" } }))).toEqual({
      url: true,
      invoke: false,
    });
  });

  it("does not count a statement for IAM auth or another principal", () => {
    const iamOnly = { ...urlStatement, Condition: { StringEquals: { "lambda:FunctionUrlAuthType": "AWS_IAM" } } };
    const account = { ...invokeStatement, Principal: { AWS: "arn:aws:iam::444455556666:root" } };
    expect(missingUrlPermissions(policy(iamOnly, account))).toEqual({ url: true, invoke: true });
  });
});

describe("redaction and the dry-run plan", () => {
  it("hides every secret value in printed text", () => {
    expect(redact(`key=${SERVICE_KEY} and ${ANTHROPIC_KEY}!`, [SERVICE_KEY, ANTHROPIC_KEY])).toBe("key=*** and ***!");
    expect(formatCommand(["lambda", "x", "--value", `a ${SERVICE_KEY}`], [SERVICE_KEY])).toBe(
      "aws lambda x --value 'a ***'",
    );
  });

  it("quotes what a shell would expand, so a printed command can be pasted", () => {
    expect(formatCommand(["lambda", "add-permission", "--principal", "*"], [])).toBe(
      "aws lambda add-permission --principal '*'",
    );
  });

  it("lists every step with variable names only, never a value", () => {
    const environment = functionEnvironment(valid(parseEnvFile(ENV_AWS).values));
    const plan = dryRunPlan(TARGET, environment).join("\n");
    expect(plan).not.toContain(SERVICE_KEY);
    expect(plan).not.toContain(ANTHROPIC_KEY);
    expect(plan).not.toContain("abcdefghijklmnop");
    expect(plan).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(plan).toContain("aws lambda create-function --function-name kolacja-podwyzkowa --architectures arm64");
    expect(plan).toContain("aws lambda add-permission");
    expect(plan).toContain("--invoked-via-function-url");
    expect(plan).toContain("Profil mikusia, region eu-central-1.");
    // Without a token the clean-up is skipped, with the way to make one.
    expect(plan).toContain("7. Codzienne usuwanie danych gości po terminie — POMINIĘTE: brak RETENTION_TOKEN");
    expect(plan).toContain("openssl rand -hex 32");
    expect(plan).not.toContain("aws scheduler create-schedule");
  });

  it("plans the role and the schedule with a token, and never shows the token", () => {
    const environment = functionEnvironment(valid({ ...parseEnvFile(ENV_AWS).values, RETENTION_TOKEN }));
    expect(environment.RETENTION_TOKEN).toBe(RETENTION_TOKEN);
    const plan = dryRunPlan(TARGET, environment).join("\n");
    expect(plan).not.toContain(RETENTION_TOKEN);
    expect(plan).toContain("RETENTION_TOKEN");
    expect(plan).toContain("AWS_LWA_PASS_THROUGH_PATH=/api/jobs/retention");
    expect(plan).toContain("aws iam create-role --role-name kolacja-podwyzkowa-scheduler");
    expect(plan).toContain("aws iam put-role-policy --role-name kolacja-podwyzkowa-scheduler");
    expect(plan).toContain(
      "aws scheduler create-schedule --name kolacja-podwyzkowa-retention --group-name default --schedule-expression 'cron(15 4 * * ? *)' --schedule-expression-timezone Europe/Warsaw",
    );
    expect(plan).toContain("aws scheduler update-schedule --name kolacja-podwyzkowa-retention");
    expect(redact(`x ${RETENTION_TOKEN} y`, [RETENTION_TOKEN])).toBe("x *** y");
  });
});

describe("the steps printed after a deploy", () => {
  const base = "https://abc123.lambda-url.eu-central-1.on.aws";

  it("start with the first platform administrator on the hosted database, through --remote", () => {
    const text = nextSteps({ base, region: "eu-central-1", aiProvider: "mock" });
    expect(text).toContain(`BASE_URL=${base}`);
    expect(text).toContain("npm run platform:admin -- <twój e-mail> --remote");
    expect(text).toContain(`${base}/logowanie`);
    expect(text).toContain(`${base}/panel/platforma`);
    expect(text).toContain("AWS_REGION=eu-central-1 npm run deploy:aws");
  });

  it("never print SQL for the hosted database, the smoke or the home page's old event creation", () => {
    const sql = /\b(delete|truncate|drop|update)\s+(from\s+)?(table\s+)?public\./i;
    // The guard itself catches the statements the old text printed.
    expect("delete from public.event;").toMatch(sql);
    expect("delete from public.restaurant where id = 1;").toMatch(sql);
    for (const aiProvider of ["mock", "anthropic"]) {
      const text = nextSteps({ base, region: "eu-central-1", aiProvider });
      // The hosted database holds every restaurant of the platform: no statement may touch it.
      expect(text).not.toMatch(sql);
      expect(text).not.toMatch(/SQL Editor/i);
      expect(text).not.toContain("npm run smoke");
      expect(text).not.toContain("Utwórz wydarzenie");
    }
  });

  it("leave out the AI step once the provider is already Anthropic", () => {
    expect(nextSteps({ base, region: "eu-central-1", aiProvider: "anthropic" })).not.toContain("AI_PROVIDER=anthropic");
  });

  it("show the clean-up's manual check once scheduled, else how to switch it on", () => {
    const scheduled = nextSteps({ base, region: "eu-central-1", aiProvider: "anthropic", retention: "scheduled" });
    expect(scheduled).toContain("harmonogram kolacja-podwyzkowa-retention (cron(15 4 * * ? *), Europe/Warsaw)");
    expect(scheduled).toContain("aws lambda invoke --function-name kolacja-podwyzkowa");
    const missing = nextSteps({ base, region: "eu-central-1", aiProvider: "anthropic", retention: "missing-token" });
    expect(missing).toContain("RETENTION_TOKEN=<wynik: openssl rand -hex 32>");
    expect(missing).not.toContain("aws lambda invoke");
    const inactive = nextSteps({ base, region: "eu-central-1", aiProvider: "mock", retention: "inactive-schedule" });
    expect(inactive).toContain("UWAGA: harmonogram kolacja-podwyzkowa-retention istnieje, ale bez RETENTION_TOKEN");
    expect(inactive).toContain("5. AI:");
  });
});
