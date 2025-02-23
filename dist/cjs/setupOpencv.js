"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SetupOpencv = void 0;
const fs_1 = __importDefault(require("fs"));
const os_1 = require("os");
const findMsBuild_js_1 = require("./findMsBuild.js");
const utils_js_1 = require("./utils.js");
const npmlog_1 = __importDefault(require("npmlog"));
const rimraf_1 = __importDefault(require("rimraf"));
const util_1 = require("util");
const misc_js_1 = require("./misc.js");
const path_1 = __importDefault(require("path"));
const primraf = (0, util_1.promisify)(rimraf_1.default);
class SetupOpencv {
    constructor(builder) {
        this.builder = builder;
        this.execLog = [];
    }
    getMsbuildCmd(sln) {
        return [
            sln,
            '/p:Configuration=Release',
            `/p:Platform=${process.arch === 'x64' ? 'x64' : 'x86'}`,
        ];
    }
    async runBuildCmd(msbuildExe) {
        const env = this.builder.env;
        if (msbuildExe) {
            if (!fs_1.default.existsSync(msbuildExe)) {
                npmlog_1.default.error('install', 'invalid msbuildExe path" %s', msbuildExe);
                throw Error('invalid msbuildExe path ' + msbuildExe);
            }
            const buildSLN = this.getMsbuildCmd('./OpenCV.sln');
            let args = (0, utils_js_1.toExecCmd)(msbuildExe, buildSLN);
            this.execLog.push(`cd ${(0, utils_js_1.protect)(env.opencvBuild)}`);
            this.execLog.push(args);
            if (!env.dryRun) {
                npmlog_1.default.info('install', 'spawning in %s: %s', env.opencvBuild, args);
                await (0, utils_js_1.spawn)(`${msbuildExe}`, buildSLN, { cwd: env.opencvBuild });
            }
            const buildVcxproj = this.getMsbuildCmd('./INSTALL.vcxproj');
            args = (0, utils_js_1.toExecCmd)(msbuildExe, buildVcxproj);
            this.execLog.push(`${args}`);
            if (!env.dryRun) {
                npmlog_1.default.info('install', 'spawning in %s: %s', env.opencvBuild, args);
                await (0, utils_js_1.spawn)(`${msbuildExe}`, buildVcxproj, { cwd: env.opencvBuild });
            }
        }
        else {
            this.execLog.push(`cd ${(0, utils_js_1.protect)(env.opencvBuild)}`);
            this.execLog.push(`make install -j${env.numberOfCoresAvailable()}`);
            if (!env.dryRun) {
                npmlog_1.default.info('install', 'spawning in %s: make', env.opencvBuild);
                await (0, utils_js_1.spawn)('make', ['install', `-j${env.numberOfCoresAvailable()}`], { cwd: env.opencvBuild });
            }
            this.execLog.push(`make all -j${env.numberOfCoresAvailable()}`);
            // revert the strange archiving of libopencv.so going on with make install
            if (!env.dryRun) {
                npmlog_1.default.info('install', 'spawning in %s: make all', env.opencvBuild);
                await (0, utils_js_1.spawn)('make', ['all', `-j${env.numberOfCoresAvailable()}`], { cwd: env.opencvBuild });
            }
        }
    }
    getWinCmakeFlags(msversion) {
        const cmakeVsCompiler = this.builder.constant.cmakeVsCompilers[msversion];
        const cmakeArch = this.builder.constant.cmakeArchs[process.arch];
        if (!cmakeVsCompiler) {
            throw new Error(`no cmake Visual Studio compiler found for msversion: ${msversion}`);
        }
        if (!cmakeArch) {
            throw new Error(`no cmake arch found for process.arch: ${process.arch}`);
        }
        let GFlag = [];
        if (Number(msversion) <= 15)
            GFlag = ['-G', `${cmakeVsCompiler}${cmakeArch}`];
        else
            GFlag = ['-G', `${cmakeVsCompiler}`];
        return GFlag.concat(this.builder.env.getSharedCmakeFlags());
    }
    getCmakeArgs(cmakeFlags) {
        npmlog_1.default.info('install', `getCmakeArgs prefixing Cmake args with ${(0, utils_js_1.highlight)("%s")}`, this.builder.env.opencvSrc);
        return [this.builder.env.opencvSrc].concat(cmakeFlags);
    }
    async getMsbuildIfWin() {
        if (this.builder.env.isWin) {
            const msbuilds = await (0, findMsBuild_js_1.findMSBuild)();
            if (msbuilds.length > 1)
                npmlog_1.default.warn('install', `${msbuilds.length} msbuild version detected using the most recent one.`);
            npmlog_1.default.info('install', `using msbuild V${(0, utils_js_1.formatNumber)("%s")} path: ${(0, utils_js_1.highlight)("%s")}`, msbuilds[0].version, msbuilds[0].path);
            return msbuilds[0];
        }
        return undefined;
    }
    /**
     * Write Build Context to disk, to avoid further rebuild
     * @returns AutoBuildFile
     */
    writeAutoBuildFile(overwrite, buildLog) {
        const env = this.builder.env;
        const autoBuildInfo = {
            opencvVersion: env.opencvVersion,
            autoBuildFlags: env.autoBuildFlags,
            modules: this.builder.getLibs.getLibs(),
            env: this.builder.env.dumpEnv(),
        };
        npmlog_1.default.info('install', `writing auto-build file into directory: ${(0, utils_js_1.highlight)("%s")}`, env.autoBuildFile);
        // log.info('install', JSON.stringify(autoBuildFile))
        fs_1.default.mkdirSync(env.opencvRoot, { recursive: true });
        if (!overwrite) {
            const old = env.readAutoBuildFile();
            if (old)
                return old;
        }
        fs_1.default.writeFileSync(env.autoBuildFile, JSON.stringify(autoBuildInfo, null, 4));
        if (buildLog)
            fs_1.default.writeFileSync(env.autoBuildLog, buildLog);
        return autoBuildInfo;
    }
    /**
     * add a sym link named latest to the current build.
     */
    linkBuild() {
        const env = this.builder.env;
        const latest = path_1.default.join(env.rootDir, 'latest');
        try {
            fs_1.default.unlinkSync(latest);
        }
        catch (_e) {
            // ignore
        }
        try {
            fs_1.default.symlinkSync(env.opencvRoot, latest);
            npmlog_1.default.info('install', `Cretate link ${(0, utils_js_1.highlight)("%s")} to ${(0, utils_js_1.highlight)("%s")}`, latest, env.opencvRoot);
        }
        catch (e) {
            npmlog_1.default.info('install', `Failed to create link ${(0, utils_js_1.highlight)("%s")} to ${(0, utils_js_1.highlight)("%s")} Error: ${(0, utils_js_1.formatRed)("%s")}`, latest, env.opencvRoot, e.message);
        }
    }
    /**
     * clone OpenCV repo
     * build OpenCV
     * delete source files
     */
    async start() {
        this.execLog = [];
        const env = this.builder.env;
        const msbuild = await this.getMsbuildIfWin();
        let cMakeFlags = [];
        let msbuildPath = '';
        // Get cmake flags here to check for CUDA early on instead of the start of the building process
        if (env.isWin) {
            if (!msbuild)
                throw Error('Error getting Ms Build info');
            cMakeFlags = this.getWinCmakeFlags("" + msbuild.version);
            msbuildPath = msbuild.path;
        }
        else {
            cMakeFlags = this.builder.env.getSharedCmakeFlags();
        }
        npmlog_1.default.info('install', `cMakeFlags will be: ${(0, utils_js_1.formatNumber)("%s")}`, cMakeFlags.join(' '));
        const tag = env.opencvVersion;
        npmlog_1.default.info('install', `installing opencv version ${(0, utils_js_1.formatNumber)("%s")} into directory: ${(0, utils_js_1.highlight)("%s")}`, tag, env.opencvRoot);
        npmlog_1.default.info('install', `Cleaning old build: src, build and contrib-src directories`);
        try {
            for (const k of misc_js_1.OPENCV_PATHS_ENV) {
                const v = process.env[k];
                if (v) {
                    const setEnv = (process.platform === 'win32') ? '$Env:' : 'export ';
                    this.execLog.push(`${setEnv}${k}=${(0, utils_js_1.protect)(v)}`);
                }
            }
            // clean up
            const dirs = [env.opencvBuild, env.opencvSrc, env.opencvContribSrc];
            this.execLog.push((0, utils_js_1.toExecCmd)('rimraf', dirs));
            for (const dir of dirs)
                await primraf(dir);
            // ensure build dir exists
            this.execLog.push((0, utils_js_1.toExecCmd)('mkdir', ['-p', env.opencvBuild]));
            fs_1.default.mkdirSync(env.opencvBuild, { recursive: true });
            // hide detached HEAD message.
            const gitFilter = (data) => {
                const asTxt = data.toString();
                if (asTxt.includes('detached HEAD'))
                    return null;
                if (asTxt.includes('--depth is ignored in local clones'))
                    return null;
                return data;
            };
            if (env.isWithoutContrib) {
                this.execLog.push((0, utils_js_1.toExecCmd)('cd', [env.opencvRoot]));
                npmlog_1.default.info('install', `skipping download of opencv_contrib since ${(0, utils_js_1.highlight)("OPENCV4NODEJS_AUTOBUILD_WITHOUT_CONTRIB")} is set`);
            }
            else {
                let opencvContribRepoUrl = this.builder.constant.opencvContribRepoUrl;
                if (this.builder.env.gitCache) {
                    if (!fs_1.default.existsSync(this.builder.env.opencvContribGitCache)) {
                        const args = ['clone', '--quiet', '--progress', opencvContribRepoUrl, this.builder.env.opencvContribGitCache];
                        await (0, utils_js_1.spawn)('git', args, { cwd: env.opencvRoot }, { err: gitFilter });
                    }
                    else {
                        await (0, utils_js_1.spawn)('git', ['pull'], { cwd: env.opencvContribGitCache }, { err: gitFilter });
                    }
                    opencvContribRepoUrl = env.opencvContribGitCache.replace(/\\/g, '/');
                }
                npmlog_1.default.info('install', `git clone ${opencvContribRepoUrl}`);
                const args = ['clone', '--quiet', '-b', `${tag}`, '--single-branch', '--depth', '1', '--progress', opencvContribRepoUrl, env.opencvContribSrc];
                this.execLog.push((0, utils_js_1.toExecCmd)('cd', [env.opencvRoot]));
                this.execLog.push((0, utils_js_1.toExecCmd)('git', args));
                await (0, utils_js_1.spawn)('git', args, { cwd: env.opencvRoot }, { err: gitFilter });
            }
            let opencvRepoUrl = this.builder.constant.opencvRepoUrl;
            if (this.builder.env.gitCache) {
                if (!fs_1.default.existsSync(this.builder.env.opencvGitCache)) {
                    const args = ['clone', '--quiet', '--progress', opencvRepoUrl, this.builder.env.opencvGitCache];
                    await (0, utils_js_1.spawn)('git', args, { cwd: env.opencvRoot }, { err: gitFilter });
                }
                else {
                    await (0, utils_js_1.spawn)('git', ['pull'], { cwd: env.opencvGitCache }, { err: gitFilter });
                }
                opencvRepoUrl = env.opencvGitCache.replace(/\\/g, '/');
            }
            npmlog_1.default.info('install', `git clone ${opencvRepoUrl}`);
            const args2 = ['clone', '--quiet', '-b', `${tag}`, '--single-branch', '--depth', '1', '--progress', opencvRepoUrl, env.opencvSrc];
            this.execLog.push((0, utils_js_1.toExecCmd)('git', args2));
            await (0, utils_js_1.spawn)('git', args2, { cwd: env.opencvRoot }, { err: gitFilter });
            this.execLog.push(`export OPENCV_BIN_DIR=${(0, utils_js_1.protect)(env.opencvBinDir)}`);
            this.execLog.push(`export OPENCV_INCLUDE_DIR=${(0, utils_js_1.protect)(env.opencvIncludeDir)}`);
            this.execLog.push(`export OPENCV_LIB_DIR=${(0, utils_js_1.protect)(env.opencvLibDir)}`);
            const cmakeArgs = this.getCmakeArgs(cMakeFlags);
            npmlog_1.default.info('install', 'running in %s cmake %s', (0, utils_js_1.protect)(env.opencvBuild), cmakeArgs.map(utils_js_1.protect).join(' '));
            this.execLog.push((0, utils_js_1.toExecCmd)('cd', [env.opencvBuild]));
            this.execLog.push((0, utils_js_1.toExecCmd)('cmake', cmakeArgs));
            if (!env.dryRun) {
                await (0, utils_js_1.spawn)('cmake', cmakeArgs, { cwd: env.opencvBuild });
                npmlog_1.default.info('install', 'starting build...');
            }
            await this.runBuildCmd(msbuildPath);
        }
        catch (e) {
            const allCmds = this.execLog.join(os_1.EOL);
            npmlog_1.default.error('build', `Compilation failed, previous calls:${os_1.EOL}%s`, allCmds);
            // log.error(`Compilation failed, previous calls:${EOL}%s`, allCmds);
            throw e;
        }
        if (!env.dryRun) {
            this.writeAutoBuildFile(true, this.execLog.join(os_1.EOL));
            this.linkBuild();
        }
        else {
            this.execLog.push('echo lock file can not be generated in dry-mode');
        }
        // cmake -D CMAKE_BUILD_TYPE=RELEASE -D ENABLE_NEON=ON 
        // -D ENABLE_TBB=ON -D ENABLE_IPP=ON -D ENABLE_VFVP3=ON -D WITH_OPENMP=ON -D WITH_CSTRIPES=ON -D WITH_OPENCL=ON -D CMAKE_INSTALL_PREFIX=/usr/local
        // -D OPENCV_EXTRA_MODULES_PATH=/root/[username]/opencv_contrib-3.4.0/modules/ ..
        if (!env.keepsources && !env.dryRun) {
            /**
             * DELETE TMP build dirs
             */
            try {
                npmlog_1.default.info('install', `cleaning openCV build file in ${(0, utils_js_1.highlight)("%s")} to keep these files enable keepsources with ${(0, utils_js_1.highlight)("--keepsources")}`, env.opencvSrc);
                await primraf(env.opencvSrc);
            }
            catch (err) {
                npmlog_1.default.error('install', 'failed to clean opencv source folder:', err);
                npmlog_1.default.error('install', `consider removing the folder yourself: ${(0, utils_js_1.highlight)("%s")}`, env.opencvSrc);
            }
            try {
                npmlog_1.default.info('install', `cleaning openCVContrib build file in ${(0, utils_js_1.highlight)("%s")} to keep these files enable keepsources with ${(0, utils_js_1.highlight)("--keepsources")}`, env.opencvContribSrc);
                await primraf(env.opencvContribSrc);
            }
            catch (err) {
                npmlog_1.default.error('install', 'failed to clean opencv_contrib source folder:', err);
                npmlog_1.default.error('install', `consider removing the folder yourself: ${(0, utils_js_1.highlight)("%s")}`, env.opencvContribSrc);
            }
        }
        else {
            npmlog_1.default.info('install', `Keeping openCV build file in ${(0, utils_js_1.highlight)("%s")}`, env.opencvSrc);
            npmlog_1.default.info('install', `Keeping openCVContrib build file in ${(0, utils_js_1.highlight)("%s")}`, env.opencvContribSrc);
        }
        if (env.dryRun) {
            console.log();
            console.log();
            console.log(this.execLog.join(os_1.EOL));
        }
    }
}
exports.SetupOpencv = SetupOpencv;
//# sourceMappingURL=setupOpencv.js.map